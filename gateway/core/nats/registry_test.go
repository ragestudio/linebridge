package nats

import "testing"

func TestRegistryKeySanitizesEventNames(t *testing.T) {
	cases := map[string]string{
		"channel:join":          "channel-join",
		"chats:channel:send":    "chats-channel-send",
		"group:vc:client:event": "group-vc-client-event",
		"already.valid-key_1":   "already.valid-key_1",
	}

	for event, expected := range cases {
		if got := registryKey(event); got != expected {
			t.Fatalf("registryKey(%q) = %q, want %q", event, got, expected)
		}
	}
}
