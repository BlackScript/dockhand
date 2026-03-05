import { describe, expect, it } from 'bun:test';

// Kopie der Funktion aus docker.ts für isolierten Unit-Test
// (Import aus docker.ts zieht DB-Initialisierung an die nicht in Bun läuft)
function sanitizeEndpointSettings(endpointSettings: any): any {
	if (!endpointSettings) return {};
	const clean: any = {};
	if (endpointSettings.IPAMConfig) clean.IPAMConfig = endpointSettings.IPAMConfig;
	if (endpointSettings.Aliases?.length) clean.Aliases = endpointSettings.Aliases;
	if (endpointSettings.Links) clean.Links = endpointSettings.Links;
	if (endpointSettings.DriverOpts && Object.keys(endpointSettings.DriverOpts).length > 0) {
		clean.DriverOpts = endpointSettings.DriverOpts;
	}
	if (endpointSettings.MacAddress) clean.MacAddress = endpointSettings.MacAddress;
	if (endpointSettings.GwPriority) clean.GwPriority = endpointSettings.GwPriority;
	return clean;
}

describe('sanitizeEndpointSettings', () => {
	it('entfernt read-only Felder aus docker inspect EndpointSettings', () => {
		const inspectData = {
			IPAMConfig: { IPv4Address: '10.0.2.10' },
			Links: null,
			Aliases: ['paperless'],
			MacAddress: '02:42:0a:00:02:0a',
			DriverOpts: null,
			NetworkID: 'abc123def456',
			EndpointID: 'xyz789',
			Gateway: '10.0.2.1',
			IPAddress: '10.0.2.10',
			IPPrefixLen: 24,
			IPv6Gateway: '',
			GlobalIPv6Address: '',
			GlobalIPv6PrefixLen: 0,
			DNSNames: ['test', 'abc123def456']
		};

		const result = sanitizeEndpointSettings(inspectData);

		expect(result.IPAMConfig).toEqual({ IPv4Address: '10.0.2.10' });
		expect(result.Aliases).toEqual(['paperless']);
		expect(result.MacAddress).toBe('02:42:0a:00:02:0a');

		expect(result.NetworkID).toBeUndefined();
		expect(result.EndpointID).toBeUndefined();
		expect(result.Gateway).toBeUndefined();
		expect(result.IPAddress).toBeUndefined();
		expect(result.IPPrefixLen).toBeUndefined();
		expect(result.IPv6Gateway).toBeUndefined();
		expect(result.GlobalIPv6Address).toBeUndefined();
		expect(result.GlobalIPv6PrefixLen).toBeUndefined();
		expect(result.DNSNames).toBeUndefined();
	});

	it('behält DriverOpts wenn nicht leer', () => {
		const input = {
			DriverOpts: { 'com.docker.network.bridge.name': 'br-custom' },
			NetworkID: 'abc123'
		};
		const result = sanitizeEndpointSettings(input);
		expect(result.DriverOpts).toEqual({ 'com.docker.network.bridge.name': 'br-custom' });
		expect(result.NetworkID).toBeUndefined();
	});

	it('entfernt leere DriverOpts', () => {
		expect(sanitizeEndpointSettings({ DriverOpts: {} }).DriverOpts).toBeUndefined();
	});

	it('entfernt leere Aliases', () => {
		expect(sanitizeEndpointSettings({ Aliases: [] }).Aliases).toBeUndefined();
	});

	it('behält GwPriority wenn nicht 0', () => {
		expect(sanitizeEndpointSettings({ GwPriority: 100 }).GwPriority).toBe(100);
	});

	it('entfernt GwPriority wenn 0', () => {
		expect(sanitizeEndpointSettings({ GwPriority: 0 }).GwPriority).toBeUndefined();
	});

	it('gibt leeres Objekt für null/undefined zurück', () => {
		expect(sanitizeEndpointSettings(null)).toEqual({});
		expect(sanitizeEndpointSettings(undefined)).toEqual({});
	});

	it('gibt leeres Objekt zurück wenn nur read-only Felder vorhanden', () => {
		const input = {
			NetworkID: 'abc',
			EndpointID: 'xyz',
			Gateway: '10.0.0.1',
			IPAddress: '10.0.0.5',
			IPPrefixLen: 24,
			DNSNames: ['test']
		};
		expect(Object.keys(sanitizeEndpointSettings(input))).toHaveLength(0);
	});

	it('verarbeitet Compose-Default-Netzwerk korrekt', () => {
		const composeDefault = {
			IPAMConfig: null,
			Links: null,
			Aliases: ['paperless-webserver', '9f3a2b1c4d5e'],
			MacAddress: '02:42:ac:12:00:03',
			DriverOpts: null,
			NetworkID: 'sha256abc123',
			EndpointID: 'sha256xyz789',
			Gateway: '172.18.0.1',
			IPAddress: '172.18.0.3',
			IPPrefixLen: 16,
			IPv6Gateway: '',
			GlobalIPv6Address: '',
			GlobalIPv6PrefixLen: 0,
			DNSNames: ['paperless-webserver', '9f3a2b1c4d5e', 'paperless-ngx_default']
		};

		const result = sanitizeEndpointSettings(composeDefault);

		expect(result.Aliases).toEqual(['paperless-webserver', '9f3a2b1c4d5e']);
		expect(result.MacAddress).toBe('02:42:ac:12:00:03');
		expect(result.NetworkID).toBeUndefined();
		expect(result.DNSNames).toBeUndefined();
		expect(result.IPAMConfig).toBeUndefined();
	});

	it('verarbeitet MACVLAN mit statischer IP korrekt', () => {
		const macvlan = {
			IPAMConfig: { IPv4Address: '10.0.2.20' },
			Links: null,
			Aliases: null,
			MacAddress: '02:42:0a:00:02:14',
			DriverOpts: null,
			NetworkID: 'macvlan123',
			EndpointID: 'endpoint456',
			Gateway: '10.0.2.1',
			IPAddress: '10.0.2.20',
			IPPrefixLen: 24,
			DNSNames: null
		};

		const result = sanitizeEndpointSettings(macvlan);

		// IPAMConfig mit statischer IP muss erhalten bleiben (kritisch für MACVLAN!)
		expect(result.IPAMConfig).toEqual({ IPv4Address: '10.0.2.20' });
		expect(result.MacAddress).toBe('02:42:0a:00:02:14');
		expect(result.NetworkID).toBeUndefined();
	});
});
