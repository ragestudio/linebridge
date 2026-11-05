package redis

import (
	"testing"
	"ultragateway/structs"
)

func TestResolveRedisConfigEnvOverride(t *testing.T) {
	t.Setenv("REDIS_URL", "redis://env-host:6379")

	config := &structs.RedisConfig{
		Enabled:  false,
		URL:      "redis://file-host:6379",
		Password: "file-password",
	}

	url, password, enabled := resolveRedisConfig(config)

	if url != "redis://env-host:6379" {
		t.Fatalf("expected the env url, got %q", url)
	}

	if password != "" {
		t.Fatalf("expected the env to drop the file password, got %q", password)
	}

	if !enabled {
		t.Fatal("expected the env url to enable redis")
	}
}

func TestResolveRedisConfigUsesFile(t *testing.T) {
	t.Setenv("REDIS_URL", "")

	config := &structs.RedisConfig{
		Enabled:  true,
		URL:      "redis://file-host:6379",
		Password: "file-password",
	}

	url, password, enabled := resolveRedisConfig(config)

	if url != "redis://file-host:6379" || password != "file-password" || !enabled {
		t.Fatalf("unexpected resolved config: %s %q %v", url, password, enabled)
	}
}
