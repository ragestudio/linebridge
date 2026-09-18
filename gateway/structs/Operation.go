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

type ByUserIdSendOperation struct {
	Data struct {
		UserID string `json:"user_id"`
	} `json:"data"`
}

type ByUserIDsOperation struct {
	Data struct {
		UserIDs []string `json:"user_ids"`
	} `json:"data"`
}

type UserPresence struct {
	SocketID  string `json:"socket_id"`
	UserID    string `json:"user_id"`
	Connected bool   `json:"connected"`
}
