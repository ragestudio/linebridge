package redis

import (
	"context"
	"log"
	"ultragateway/structs"

	"github.com/redis/go-redis/v9"
)

type Instance struct {
	Client *redis.Client
	Config *structs.RedisConfig
}

func Connect(config *structs.RedisConfig) *Instance {
	if !config.Enabled {
		return nil
	}

	opts, err := redis.ParseURL(config.URL)
	if err != nil {
		log.Fatalf("Failed to parse redis URL: %v", err)
	}

	if config.Password != "" {
		opts.Password = config.Password
	}

	client := redis.NewClient(opts)

	if err := client.Ping(context.Background()).Err(); err != nil {
		log.Fatalf("Failed to connect to redis: %v", err)
	}

	return &Instance{
		Client: client,
		Config: config,
	}
}
