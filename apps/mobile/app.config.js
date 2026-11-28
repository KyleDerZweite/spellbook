module.exports = ({ config }) => {
	if (process.env.SPELLBOOK_LOCAL_HTTP !== '1') return config;

	return {
		...config,
		ios: {
			...config.ios,
			infoPlist: {
				...config.ios.infoPlist,
				NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
				NSLocalNetworkUsageDescription: 'Connect to your local Spellbook development server.'
			}
		},
		plugins: [
			...config.plugins,
			['expo-build-properties', { android: { usesCleartextTraffic: true } }]
		]
	};
};
