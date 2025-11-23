// File: next.config.js

const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config, { isServer }) => {
    // Ignore .cs files using null-loader
    config.module.rules.push({
      test: /\.cs$/,
      use: 'null-loader',
    });

    // Client-side specific configurations
    if (!isServer) {
      // Exclude @mapbox/node-pre-gyp from the client-side build
      config.externals = [
        ...(config.externals || []),
        { '@mapbox/node-pre-gyp': 'commonjs @mapbox/node-pre-gyp' }
      ];

      // Configure fallback for unsupported Node.js modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        os: false,
        crypto: false,
        http: false,
        https: false,
        stream: false,
        zlib: false,
        net: false,
        tls: false,
      };

      config.resolve.alias['@tensorflow/tfjs-node'] = '@tensorflow/tfjs';
    }

    // Ignore .html files using null-loader
    config.module.rules.push({
      test: /\.html$/,
      use: 'null-loader',
    });

    // Suppress warnings for require-in-the-middle and OpenTelemetry
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      { module: /require-in-the-middle/ },
      { module: /@opentelemetry\/instrumentation/ },
    ];

    return config;
  },
};

module.exports = nextConfig;
