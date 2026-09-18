package app

import (
	"context"
	"log"

	"github.com/sirupsen/logrus"
	"go.opentelemetry.io/contrib/bridges/otellogrus"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlplog/otlploggrpc"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	otel_log "go.opentelemetry.io/otel/sdk/log"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.10.0"
)

var OTEL_DEFAULT_ENDPOINT string = "http://localhost:4317"
var OTEL_DEFAULT_SERVICE_NAME string = "linebridge-gateway"

type OTEL struct {
	Resource      *resource.Resource
	TraceExporter *otlptrace.Exporter

	LogProvider   *otel_log.LoggerProvider
	TraceProvider *sdktrace.TracerProvider
}

func (app *App) InitOTEL() {
	if app.Config.OTEL.Endpoint == nil {
		log.Printf("WARN: Missing OTEL endpoint. Using default: %s", OTEL_DEFAULT_ENDPOINT)
		app.Config.OTEL.Endpoint = &OTEL_DEFAULT_ENDPOINT
	}
	if app.Config.OTEL.ServiceName == nil {
		app.Config.OTEL.ServiceName = &OTEL_DEFAULT_SERVICE_NAME
	}

	// Initialize OpenTelemetry
	log.Println("Initializing OpenTelemetry...")

	ctx := context.Background()

	app.OTEL = &OTEL{}

	app.OTEL.Resource = resource.NewWithAttributes(
		semconv.SchemaURL,
		semconv.ServiceNameKey.String(*app.Config.OTEL.ServiceName),
	)

	var err error

	app.OTEL.TraceExporter, err = otlptracegrpc.New(ctx,
		otlptracegrpc.WithEndpoint(*app.Config.OTEL.Endpoint),
		otlptracegrpc.WithInsecure(),
	)
	if err != nil {
		log.Fatalf("Failed to create trace exporter: %v", err)
	}

	app.OTEL.TraceProvider = sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(app.OTEL.TraceExporter),
		sdktrace.WithResource(app.OTEL.Resource),
	)

	otel.SetTracerProvider(app.OTEL.TraceProvider)

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	logExporter, err := otlploggrpc.New(ctx,
		otlploggrpc.WithEndpoint(*app.Config.OTEL.Endpoint),
		otlploggrpc.WithInsecure(),
	)

	if err != nil {
		// handle error
		log.Fatal(err)
	}

	// create log provider
	app.OTEL.LogProvider = otel_log.NewLoggerProvider(
		otel_log.WithProcessor(
			otel_log.NewBatchProcessor(logExporter),
		),
		otel_log.WithResource(app.OTEL.Resource),
	)

	hook := otellogrus.NewHook(*app.Config.OTEL.ServiceName, otellogrus.WithLoggerProvider(app.OTEL.LogProvider))

	logrus.AddHook(hook)

	log.Println("OpenTelemetry initialized successfully.")
}
