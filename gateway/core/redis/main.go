package redis

import (
	"context"
	"log"
	"os"
	"strings"
	"ultragateway/structs"

	"github.com/redis/go-redis/v9"
)

type Instance struct {
	Client *redis.Client
	Config *structs.RedisConfig
}

// resolveRedisConfig applies the REDIS_URL override
// it wins over the gateway config, so a single variable can point both the
// gateway and the services to the same server
func resolveRedisConfig(config *structs.RedisConfig) (string, string, bool) {
	url := strings.TrimSpace(config.URL)
	password := config.Password
	enabled := config.Enabled

	if envURL := strings.TrimSpace(os.Getenv("REDIS_URL")); envURL != "" {
		url = envURL
		password = ""
		enabled = true
	}

	return url, password, enabled
}

func Connect(config *structs.RedisConfig) *Instance {
	if config == nil {
		return nil
	}

	url, password, enabled := resolveRedisConfig(config)

	if !enabled {
		return nil
	}

	opts, err := redis.ParseURL(url)
	if err != nil {
		log.Fatalf("Failed to parse redis URL: %v", err)
	}

	if password != "" {
		opts.Password = password
	}

	client := redis.NewClient(opts)

	if err := client.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to redis: %v", err)
	}

	// expose the effective config, not the one from the file
	resolved := *config
	resolved.URL = url
	resolved.Password = password
	resolved.Enabled = enabled

	return &Instance{
		Client: client,
		Config: &resolved,
	}
}
