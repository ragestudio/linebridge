package jsvm

import (
	"context"
	"errors"
	"io"
	"log"
	"net/http"

	"github.com/cloudwego/hertz/pkg/protocol"
	"github.com/dop251/goja"
)

type NetFetchParams struct {
	Url           string            `json:"url"`
	ServiceSocket string            `json:"serviceSocket"`
	Method        string            `json:"method"`
	Headers       map[string]string `json:"headers"`
}

type NetFetchResult struct {
	Body  string `json:"body"`
	Error string `json:"error"`
}

func (instance *NetRequest) Fetch(arg goja.Value) goja.Value {
	params := &NetFetchParams{}

	if err := instance.Runtime.ExportTo(arg, params); err != nil {
		return instance.Runtime.NewTypeError(err)
	}

	if params.Url == "" && params.ServiceSocket == "" {
		return instance.Runtime.NewTypeError(errors.New("missing url or socket"))
	}

	if params.Method == "" {
		params.Method = "GET"
	}

	var err error
	var result *NetFetchResult

	if params.ServiceSocket != "" {
		result, err = ServiceSocketFetch(instance, params)
	} else {
		result, err = StandardFetch(params)
	}

	if err != nil {
		return instance.Runtime.ToValue(&NetFetchResult{
			Error: err.Error(),
		})
	}

	return instance.Runtime.ToValue(result)
}

func ServiceSocketFetch(instance *NetRequest, params *NetFetchParams) (*NetFetchResult, error) {
	service, ok := (*instance.JSVM.WebsocketManager.Services)[params.ServiceSocket]

	if !ok {
		return nil, errors.New("Service not found")
	}

	client := service.GetSocketClient()

	if client == nil {
		return nil, errors.New("Service socket client not available")
	}

	req := &protocol.Request{}
	res := &protocol.Response{}

	if params.Headers != nil {
		for key, value := range params.Headers {
			req.Header.Add(key, value)
		}
	}

	req.Header.Add("Host", "0.0.0.0")
	req.SetMethod(params.Method)
	req.SetRequestURI(params.Url)

	err := client.Do(context.Background(), req, res)

	if err != nil {
		return nil, err
	}

	return &NetFetchResult{
		Body: string(res.Body()),
	}, nil
}

func StandardFetch(params *NetFetchParams) (*NetFetchResult, error) {
	client := &http.Client{}
	req := &http.Request{
		Method: params.Method,
	}

	if parsedUrl, err := req.URL.Parse(params.Url); err != nil {
		log.Printf("Failed to parse URL: %v", err)
		return nil, err
	} else {
		req.URL = parsedUrl
	}

	if params.Headers != nil {
		for key, value := range params.Headers {
			req.Header.Add(key, value)
		}
	}

	res, err := client.Do(req)

	if err != nil {
		return nil, err
	}

	defer res.Body.Close()

	bodyBytes, err := io.ReadAll(res.Body)

	if err != nil {
		return nil, err
	}

	return &NetFetchResult{
		Body: string(bodyBytes),
	}, nil
}
