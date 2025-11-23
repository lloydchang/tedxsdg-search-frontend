"use client"; // browser only: https://react.dev/reference/react/use-client
import { HoneycombWebSDK } from '@honeycombio/opentelemetry-web';
import { getWebAutoInstrumentations } from '@opentelemetry/auto-instrumentations-web';

const configDefaults = {
    ignoreNetworkEvents: true,
    // propagateTraceHeaderCorsUrls: [
    // /.+/g, // Regex to match your backend URLs. Update to the domains you wish to include.
    // ]
}

export default function Observability() {
    if (typeof window === 'undefined') {
        return null;
    }

    try {
        const sdk = new HoneycombWebSDK({
            // endpoint: "https://api.eu1.honeycomb.io/v1/traces", // Send to EU instance of Honeycomb. Defaults to sending to US instance.
            debug: true, // Set to false for production environment.
            apiKey: process.env.NEXT_PUBLIC_HONEYCOMB_API_KEY || 'YOUR_API_KEY', // Replace with your Honeycomb Ingest API Key.
            serviceName: process.env.NEXT_PUBLIC_HONEYCOMB_SERVICE_NAME || 'tedxsdg-search-frontend', // Replace with your application name.
            instrumentations: [getWebAutoInstrumentations({
                // Loads custom configuration for xml-http-request instrumentation.
                '@opentelemetry/instrumentation-xml-http-request': configDefaults,
                '@opentelemetry/instrumentation-fetch': configDefaults,
                '@opentelemetry/instrumentation-document-load': configDefaults,
                '@opentelemetry/instrumentation-user-interaction': {
                    eventNames: ['click', 'submit', 'keypress'],
                },
            })],
        });
        sdk.start();
    } catch (e) {
        console.error("Honeycomb SDK failed to start", e);
        return null;
    }
    return null;
}
