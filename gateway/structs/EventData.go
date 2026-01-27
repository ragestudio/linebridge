package structs

type EventData struct {
	Event string `json:"event"`
	Data  any    `json:"data,omitempty"`
}
