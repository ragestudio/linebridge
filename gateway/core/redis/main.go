package redis

import (
	"context"
	"fmt"
	"log"
	"net/url"
	"os"
	"strconv"
	"strings"
	"ultragateway/structs"

	"github.com/redis/go-redis/v9"
)

type Instance struct {
	Client *redis.Client
	Config *structs.RedisConfig
}

// envRedisURL builds a redis url from the same variables the services use,
// so the gateway and the microservices can not point to different servers
func envRedisURL() string {
	host := strings.TrimSpace(os.Getenv("REDIS_HOST"))

	if host == "" {
		return ""
	}

	port := strings.TrimSpace(os.Getenv("REDIS_PORT"))

	if port == "" {
		port = "6379"
	}

	username := strings.TrimSpace(os.Getenv("REDIS_USERNAME"))
	password := strings.TrimSpace(os.Getenv("REDIS_PASSWORD"))

	if auth := strings.TrimSpace(os.Getenv("REDIS_AUTH")); auth != "" {
		if parts := strings.SplitN(auth, ":", 2); len(parts) == 2 {
			username = parts[0]
			password = parts[1]
		} else {
			password = auth
		}
	}

	if noAuth, _ := strconv.ParseBool(strings.TrimSpace(os.Getenv("REDIS_NO_AUTH"))); noAuth {
		username = ""
		password = ""
	}

	auth := ""

	if username != "" && password != "" {
		auth = fmt.Sprintf("%s:%s@", url.QueryEscape(username), url.QueryEscape(password))
	} else if password != "" {
		auth = fmt.Sprintf(":%s@", url.QueryEscape(password))
	}

	path := ""

	if db := strings.TrimSpace(os.Getenv("REDIS_DB")); db != "" && db != "0" {
		path = "/" + db
	}

	return fmt.Sprintf("redis://%s%s:%s%s", auth, host, port, path)
}

// resolveRedisConfig applies the env overrides
// REDIS_URL wins over everything, then the individual REDIS_* variables used
// by the services, and the gateway config is the last fallback
func resolveRedisConfig(config *structs.RedisConfig) (string, string, bool) {
	if envURL := strings.TrimSpace(os.Getenv("REDIS_URL")); envURL != "" {
		return envURL, "", true
	}

	if envURL := envRedisURL(); envURL != "" {
		return envURL, "", true
	}

	return strings.TrimSpace(config.URL), config.Password, config.Enabled
}

func Connect(config *structs.RedisConfig) *Instance {
	if config == nil {
		return nil
	}

	redisURL, password, enabled := resolveRedisConfig(config)

	if !enabled {
		return nil
	}

	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		log.Fatalf("Failed to parse redis URL: %v", err)
	}

	if password != "" {
		opts.Password = password
	}

	client := redis.NewClient(opts)

	if err := client.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to redis [%s]: %v", opts.Addr, err)
	}

	log.Printf("Redis connected to %s", opts.Addr)

	// expose the effective config, not the one from the file
	resolved := *config
	resolved.URL = redisURL
	resolved.Password = password
	resolved.Enabled = enabled

	return &Instance{
		Client: client,
		Config: &resolved,
	}
}
