package structs

type Operation struct {
	Type string `json:"type"`
	Data any    `json:"data,omitempty"`
}

type OperationResult struct {
	Ok    bool `json:"ok"`
	Data  any  `json:"data,omitempty"`
	Error any  `json:"error,omitempty"`
}

type ByTopicOperation struct {
	Data struct {
		Topic string `json:"topic"`
	} `json:"data"`
}

type ByUserIDOperation struct {
	Data struct {
		UserID string `json:"user_id"`
	} `json:"data"`
}
