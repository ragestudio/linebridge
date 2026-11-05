package redis

import (
	"testing"
	"ultragateway/structs"
)

func TestResolveRedisConfigEnvOverride(t *testing.T) {
	t.Setenv("REDIS_URL", "redis://env-host:6379")
	t.Setenv("REDIS_HOST", "10.0.0.5")

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

func TestResolveRedisConfigHostEnv(t *testing.T) {
	t.Setenv("REDIS_URL", "")
	t.Setenv("REDIS_HOST", "10.0.0.5")
	t.Setenv("REDIS_PORT", "6380")
	t.Setenv("REDIS_PASSWORD", "secret")
	t.Setenv("REDIS_USERNAME", "")
	t.Setenv("REDIS_AUTH", "")
	t.Setenv("REDIS_NO_AUTH", "")

	config := &structs.RedisConfig{
		Enabled: false,
		URL:     "redis://file-host:6379",
	}

	url, password, enabled := resolveRedisConfig(config)

	if url != "redis://:secret@10.0.0.5:6380" {
		t.Fatalf("unexpected url %q", url)
	}

	if password != "" {
		t.Fatalf("expected the password to live in the url, got %q", password)
	}

	if !enabled {
		t.Fatal("expected the host env to enable redis")
	}
}

func TestResolveRedisConfigUsesFile(t *testing.T) {
	t.Setenv("REDIS_URL", "")
	t.Setenv("REDIS_HOST", "")
	t.Setenv("REDIS_PORT", "")
	t.Setenv("REDIS_PASSWORD", "")
	t.Setenv("REDIS_USERNAME", "")
	t.Setenv("REDIS_AUTH", "")

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
