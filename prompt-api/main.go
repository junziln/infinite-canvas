package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	defaultAddress  = "127.0.0.1:18083"
	defaultDataFile = "./data/prompts.json"
	maxPageSize     = 40
)

type prompt struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	CoverURL  string   `json:"coverUrl"`
	Prompt    string   `json:"prompt"`
	Tags      []string `json:"tags"`
	Category  string   `json:"category"`
	GitHubURL string   `json:"githubUrl"`
	Preview   string   `json:"preview"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
	License   string   `json:"license,omitempty"`
	Author    string   `json:"author,omitempty"`
	SourceURL string   `json:"sourceUrl,omitempty"`
	Images    []string `json:"images,omitempty"`
}

type promptSummary struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	CoverURL  string   `json:"coverUrl"`
	Tags      []string `json:"tags"`
	Category  string   `json:"category"`
	CreatedAt string   `json:"createdAt"`
	UpdatedAt string   `json:"updatedAt"`
	Author    string   `json:"author,omitempty"`
}

type promptPayload struct {
	Items []prompt `json:"items"`
}

type promptStore struct {
	items  []prompt
	byID   map[string]prompt
	search map[string]string
}

type bucket struct {
	tokens   float64
	updated  time.Time
	lastSeen time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	rate    float64
	burst   float64
	buckets map[string]*bucket
}

type server struct {
	store         *promptStore
	listLimiter   *rateLimiter
	detailLimiter *rateLimiter
}

func main() {
	dataFile := envOrDefault("PROMPT_DATA_FILE", defaultDataFile)
	address := envOrDefault("PROMPT_API_ADDR", defaultAddress)
	store, err := loadPromptStore(dataFile)
	if err != nil {
		log.Fatalf("加载提示词数据失败：%v", err)
	}

	app := &server{
		store:         store,
		listLimiter:   newRateLimiter(60, 60),
		detailLimiter: newRateLimiter(20, 5),
	}
	go app.listLimiter.cleanup()
	go app.detailLimiter.cleanup()

	mux := http.NewServeMux()
	mux.HandleFunc("/health", app.handleHealth)
	mux.HandleFunc("/prompt-api/prompts", app.handlePromptList)
	mux.HandleFunc("/prompt-api/prompts/", app.handlePromptDetail)

	httpServer := &http.Server{
		Addr:              address,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    16 << 10,
	}

	log.Printf("提示词接口已启动，监听 %s，共加载 %d 条", address, len(store.items))
	if err := httpServer.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
}

func loadPromptStore(path string) (*promptStore, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var payload promptPayload
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&payload); err != nil {
		return nil, err
	}
	if len(payload.Items) == 0 {
		return nil, errors.New("提示词数据为空")
	}

	store := &promptStore{
		items:  payload.Items,
		byID:   make(map[string]prompt, len(payload.Items)),
		search: make(map[string]string, len(payload.Items)),
	}
	for _, item := range payload.Items {
		if item.ID == "" {
			return nil, errors.New("存在缺少编号的提示词")
		}
		if _, exists := store.byID[item.ID]; exists {
			return nil, fmt.Errorf("提示词编号重复：%s", item.ID)
		}
		store.byID[item.ID] = item
		store.search[item.ID] = strings.ToLower(strings.Join([]string{
			item.Title,
			item.Prompt,
			item.Category,
			item.Author,
			strings.Join(item.Tags, " "),
		}, " "))
	}
	return store, nil
}

func (s *server) handleHealth(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(response, http.StatusMethodNotAllowed, "仅支持读取")
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"ok": true, "total": len(s.store.items)})
}

func (s *server) handlePromptList(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(response, http.StatusMethodNotAllowed, "仅支持读取")
		return
	}
	client := clientIP(request)
	if allowed, retryAfter := s.listLimiter.allow(client); !allowed {
		response.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		log.Printf("列表请求触发限流：%s", client)
		writeError(response, http.StatusTooManyRequests, "请求过于频繁，请稍后再试")
		return
	}

	query := request.URL.Query()
	page := positiveInt(query.Get("page"), 1)
	if page > 1_000_000 {
		page = 1_000_000
	}
	pageSize := positiveInt(query.Get("pageSize"), 20)
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}
	keyword := strings.ToLower(strings.TrimSpace(query.Get("keyword")))
	if len([]rune(keyword)) > 200 {
		writeError(response, http.StatusBadRequest, "搜索内容过长")
		return
	}
	category := strings.TrimSpace(query.Get("category"))
	tags := normalizedValues(query["tag"])

	withoutTagFilter := s.store.filter(keyword, category, nil)
	filtered := s.store.filter(keyword, category, tags)
	start := min((page-1)*pageSize, len(filtered))
	end := min(start+pageSize, len(filtered))
	items := make([]promptSummary, 0, end-start)
	for _, item := range filtered[start:end] {
		items = append(items, summarize(item))
	}

	writeJSON(response, http.StatusOK, map[string]any{
		"items":      items,
		"tags":       collectTags(withoutTagFilter),
		"categories": collectCategories(s.store.items),
		"total":      len(filtered),
	})
}

func (s *server) handlePromptDetail(response http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet {
		writeError(response, http.StatusMethodNotAllowed, "仅支持读取")
		return
	}
	client := clientIP(request)
	if allowed, retryAfter := s.detailLimiter.allow(client); !allowed {
		response.Header().Set("Retry-After", strconv.Itoa(retryAfter))
		log.Printf("详情请求触发限流：%s", client)
		writeError(response, http.StatusTooManyRequests, "请求过于频繁，请稍后再试")
		return
	}

	rawID := strings.TrimPrefix(request.URL.Path, "/prompt-api/prompts/")
	if rawID == "" || strings.Contains(rawID, "/") {
		writeError(response, http.StatusNotFound, "提示词不存在")
		return
	}
	id, err := url.PathUnescape(rawID)
	if err != nil {
		writeError(response, http.StatusBadRequest, "提示词编号无效")
		return
	}
	item, exists := s.store.byID[id]
	if !exists {
		writeError(response, http.StatusNotFound, "提示词不存在")
		return
	}
	writeJSON(response, http.StatusOK, map[string]any{"item": item})
}

func (s *promptStore) filter(keyword, category string, tags []string) []prompt {
	result := make([]prompt, 0, len(s.items))
	for _, item := range s.items {
		if category != "" && category != "all" && category != "全部" && item.Category != category {
			continue
		}
		if len(tags) > 0 && !containsAny(item.Tags, tags) {
			continue
		}
		if keyword != "" && !strings.Contains(s.search[item.ID], keyword) {
			continue
		}
		result = append(result, item)
	}
	return result
}

func newRateLimiter(perMinute, burst int) *rateLimiter {
	return &rateLimiter{
		rate:    float64(perMinute) / 60,
		burst:   float64(burst),
		buckets: make(map[string]*bucket),
	}
}

func (limiter *rateLimiter) allow(key string) (bool, int) {
	now := time.Now()
	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	value, exists := limiter.buckets[key]
	if !exists {
		value = &bucket{tokens: limiter.burst, updated: now}
		limiter.buckets[key] = value
	}
	elapsed := now.Sub(value.updated).Seconds()
	value.tokens = math.Min(limiter.burst, value.tokens+elapsed*limiter.rate)
	value.updated = now
	value.lastSeen = now
	if value.tokens < 1 {
		retryAfter := int(math.Ceil((1 - value.tokens) / limiter.rate))
		return false, max(1, retryAfter)
	}
	value.tokens--
	return true, 0
}

func (limiter *rateLimiter) cleanup() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for now := range ticker.C {
		limiter.mu.Lock()
		for key, value := range limiter.buckets {
			if now.Sub(value.lastSeen) > 30*time.Minute {
				delete(limiter.buckets, key)
			}
		}
		limiter.mu.Unlock()
	}
}

func summarize(item prompt) promptSummary {
	return promptSummary{
		ID:        item.ID,
		Title:     item.Title,
		CoverURL:  item.CoverURL,
		Tags:      item.Tags,
		Category:  item.Category,
		CreatedAt: item.CreatedAt,
		UpdatedAt: item.UpdatedAt,
		Author:    item.Author,
	}
}

func collectTags(items []prompt) []string {
	values := make(map[string]struct{})
	for _, item := range items {
		for _, tag := range item.Tags {
			if tag != "" {
				values[tag] = struct{}{}
			}
		}
	}
	return sortedKeys(values)
}

func collectCategories(items []prompt) []string {
	values := make(map[string]struct{})
	for _, item := range items {
		if item.Category != "" {
			values[item.Category] = struct{}{}
		}
	}
	return sortedKeys(values)
}

func sortedKeys(values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Strings(result)
	return result
}

func containsAny(values, targets []string) bool {
	set := make(map[string]struct{}, len(values))
	for _, value := range values {
		set[value] = struct{}{}
	}
	for _, target := range targets {
		if _, exists := set[target]; exists {
			return true
		}
	}
	return false
}

func normalizedValues(values []string) []string {
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func clientIP(request *http.Request) string {
	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err != nil {
		host = request.RemoteAddr
	}
	parsed := net.ParseIP(host)
	if parsed != nil && parsed.IsLoopback() {
		if realIP := strings.TrimSpace(request.Header.Get("X-Real-IP")); realIP != "" {
			return realIP
		}
		if forwarded := strings.TrimSpace(strings.Split(request.Header.Get("X-Forwarded-For"), ",")[0]); forwarded != "" {
			return forwarded
		}
	}
	if host == "" {
		return "unknown"
	}
	return host
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		response.Header().Set("Content-Type", "application/json; charset=utf-8")
		response.Header().Set("Cache-Control", "no-store")
		response.Header().Set("X-Content-Type-Options", "nosniff")
		next.ServeHTTP(response, request)
	})
}

func writeJSON(response http.ResponseWriter, status int, value any) {
	response.WriteHeader(status)
	if err := json.NewEncoder(response).Encode(value); err != nil {
		log.Printf("写入响应失败：%v", err)
	}
}

func writeError(response http.ResponseWriter, status int, message string) {
	writeJSON(response, status, map[string]string{"message": message})
}

func positiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed < 1 {
		return fallback
	}
	return parsed
}

func envOrDefault(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}
