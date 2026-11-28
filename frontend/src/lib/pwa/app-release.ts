export interface AppRelease {
	android: {
		href: string;
		direct: boolean;
		version?: string;
		minAndroid?: string;
		size?: string;
		sha256?: string;
	};
	testFlightUrl: string | null;
	appStoreUrl: string | null;
}
