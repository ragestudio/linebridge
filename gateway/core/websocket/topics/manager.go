package topics

import (
	"errors"
	"sort"
	"sync"

	"github.com/lxzan/gws"
)

const maxTopicLength = 256

var (
	ErrEmptyTopic   = errors.New("topic is required")
	ErrTopicTooLong = errors.New("topic name is too long")
	ErrTopicLimit   = errors.New("topic subscription limit reached")
)

// Manager keeps the topic subscriptions of every connection
// unlike a generic emitter, empty topics are removed as soon as the last
// subscriber leaves, so client controlled topic names can not grow the
// table forever
type Manager struct {
	mu               sync.RWMutex
	maxTopicsPerConn int
	byTopic          map[string]map[string]*gws.Conn
	byConn           map[string]map[string]struct{}
}

func NewManager(maxTopicsPerConn int) *Manager {
	return &Manager{
		maxTopicsPerConn: maxTopicsPerConn,
		byTopic:          make(map[string]map[string]*gws.Conn),
		byConn:           make(map[string]map[string]struct{}),
	}
}

func (manager *Manager) Subscribe(connID string, conn *gws.Conn, topic string) error {
	if connID == "" || conn == nil {
		return ErrEmptyTopic
	}

	if topic == "" {
		return ErrEmptyTopic
	}

	if len(topic) > maxTopicLength {
		return ErrTopicTooLong
	}

	manager.mu.Lock()
	defer manager.mu.Unlock()

	connTopics := manager.byConn[connID]

	if subs, ok := manager.byTopic[topic]; ok {
		if _, exists := subs[connID]; exists {
			return nil
		}
	}

	if manager.maxTopicsPerConn > 0 && len(connTopics) >= manager.maxTopicsPerConn {
		return ErrTopicLimit
	}

	subs, ok := manager.byTopic[topic]

	if !ok {
		subs = make(map[string]*gws.Conn)
		manager.byTopic[topic] = subs
	}

	if connTopics == nil {
		connTopics = make(map[string]struct{})
		manager.byConn[connID] = connTopics
	}

	subs[connID] = conn
	connTopics[topic] = struct{}{}

	return nil
}

func (manager *Manager) Unsubscribe(connID, topic string) {
	if connID == "" || topic == "" {
		return
	}

	manager.mu.Lock()
	defer manager.mu.Unlock()

	manager.unsubscribeLocked(connID, topic)
}

func (manager *Manager) UnsubscribeAll(connID string) {
	if connID == "" {
		return
	}

	manager.mu.Lock()
	defer manager.mu.Unlock()

	connTopics, ok := manager.byConn[connID]

	if !ok {
		return
	}

	for topic := range connTopics {
		manager.unsubscribeLocked(connID, topic)
	}
}

func (manager *Manager) unsubscribeLocked(connID, topic string) {
	if subs, ok := manager.byTopic[topic]; ok {
		delete(subs, connID)

		if len(subs) == 0 {
			delete(manager.byTopic, topic)
		}
	}

	if connTopics, ok := manager.byConn[connID]; ok {
		delete(connTopics, topic)

		if len(connTopics) == 0 {
			delete(manager.byConn, connID)
		}
	}
}

// Broadcast sends the framed message to every subscriber of the topic
// writes are queued per connection, so a slow client can not block here
func (manager *Manager) Broadcast(topic string, broadcaster *gws.Broadcaster) int {
	manager.mu.RLock()
	defer manager.mu.RUnlock()

	subs, ok := manager.byTopic[topic]

	if !ok {
		return 0
	}

	for _, conn := range subs {
		_ = broadcaster.Broadcast(conn, nil)
	}

	return len(subs)
}

func (manager *Manager) CountTopic(topic string) int {
	manager.mu.RLock()
	defer manager.mu.RUnlock()

	return len(manager.byTopic[topic])
}

func (manager *Manager) CountConn(connID string) int {
	manager.mu.RLock()
	defer manager.mu.RUnlock()

	return len(manager.byConn[connID])
}

// Topics returns the topics a connection is subscribed to
func (manager *Manager) Topics(connID string) []string {
	manager.mu.RLock()
	defer manager.mu.RUnlock()

	connTopics := manager.byConn[connID]
	topics := make([]string, 0, len(connTopics))

	for topic := range connTopics {
		topics = append(topics, topic)
	}

	sort.Strings(topics)

	return topics
}
