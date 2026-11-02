package nodes

import (
	"context"
	"errors"
	"fmt"
	"log"
	"sync"
	"time"
	"ultragateway/core/nats"
	"ultragateway/utils"

	"github.com/bytedance/sonic"
	"github.com/nats-io/nats.go/jetstream"
)

type Node struct {
	Id          string `json:"id"`
	MachineID   string `json:"machine_id"`
	NetworkAddr string `json:"net_addr"`
}

type NodeManager struct {
	GatewayID string
	Nats      *nats.Instance
	KV        jetstream.KeyValue

	mu       sync.RWMutex
	nodesMap map[string]Node

	CurrentNode Node
	List        []Node
}

func New(gatewayId string, nats *nats.Instance) (*NodeManager, error) {
	if nats == nil {
		return nil, errors.New("Cannot create NodesManager, nats not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	kv, err := nats.Jetstream.CreateOrUpdateKeyValue(ctx, jetstream.KeyValueConfig{
		Bucket: "gateway_nodes",
	})

	if err != nil {
		return nil, err
	}

	return &NodeManager{
		GatewayID: gatewayId,
		KV:        kv,
		Nats:      nats,
		nodesMap:  make(map[string]Node),
		List:      make([]Node, 0),
	}, nil
}

func (mng *NodeManager) Watch(ctx context.Context) error {
	watcher, err := mng.KV.WatchAll(ctx)

	if err != nil {
		return err
	}

	go func() {
		defer watcher.Stop()

		for {
			select {
			case <-ctx.Done():
				return
			case entry, ok := <-watcher.Updates():
				if !ok {
					return
				}

				if entry == nil {
					log.Printf("Sync done. Active nodes: %d", len(mng.GetNodes()))
					continue
				}

				mng.handleEntry(entry)
			}
		}
	}()

	return nil
}

func (mng *NodeManager) GetNodes() []Node {
	mng.mu.RLock()
	defer mng.mu.RUnlock()

	result := make([]Node, len(mng.List))
	copy(result, mng.List)

	return result
}

func (mng *NodeManager) Register() error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	machineId, err := utils.ReadMachineID()

	if err != nil {
		log.Println("Failed to register, cannot read machine id")
		return err
	}

	node := Node{
		Id:        mng.GatewayID,
		MachineID: machineId,
	}

	encoded, err := sonic.Marshal(&node)
	if err != nil {
		log.Println("Failed to register, cannot encode node")
		return err
	}

	_, err = mng.KV.Put(ctx, node.Id, encoded)

	if err != nil {
		log.Printf("Failed to register, cannot put into KV: %v", err)
		return err
	}

	mng.mu.Lock()
	mng.CurrentNode = node
	mng.mu.Unlock()

	log.Printf("Node registered into KV with id [%v](%v)", node.Id, node.MachineID)
	return nil
}

func (mng *NodeManager) Unregister(ctx context.Context) error {
	mng.mu.RLock()
	nodeId := mng.CurrentNode.Id
	mng.mu.RUnlock()

	if nodeId == "" {
		return errors.New("cannot unregister: node has not been registered yet")
	}

	err := mng.KV.Delete(ctx, nodeId)

	if err != nil {
		return fmt.Errorf("failed to unregister node %s from KV: %w", nodeId, err)
	}

	mng.mu.Lock()
	mng.CurrentNode = Node{}
	mng.mu.Unlock()

	log.Printf("Node [%s] unregister successfully", nodeId)
	return nil
}

func (mng *NodeManager) SerializeList() ([]byte, error) {
	data, err := sonic.Marshal(mng.List)

	if err != nil {
		return nil, err
	}

	return data, nil
}

func (mng *NodeManager) SerializeListString() (string, error) {
	data, err := sonic.MarshalString(mng.List)

	if err != nil {
		return "", err
	}

	return data, nil
}

func (mng *NodeManager) handleEntry(entry jetstream.KeyValueEntry) {
	mng.mu.Lock()
	defer mng.mu.Unlock()

	switch entry.Operation() {
	case jetstream.KeyValuePut:
		var node Node
		if err := sonic.Unmarshal(entry.Value(), &node); err != nil {
			log.Printf("Failed to unmarshal node %s: %v", entry.Key(), err)
			return
		}
		mng.nodesMap[entry.Key()] = node
		log.Printf("Node added/updated: %s", node.Id)

	case jetstream.KeyValueDelete, jetstream.KeyValuePurge:
		delete(mng.nodesMap, entry.Key())
		log.Printf("Node deleted: %s", entry.Key())
	}

	mng.List = make([]Node, 0, len(mng.nodesMap))

	for _, node := range mng.nodesMap {
		mng.List = append(mng.List, node)
	}
}
