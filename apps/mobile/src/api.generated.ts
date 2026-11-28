// Generated from contracts/openapi.json by npm run generate:api.
export interface paths {
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Exchange local credentials for an opaque session token */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["LoginRequest"];
                };
            };
            responses: {
                /** @description Authenticated session */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["AuthSession"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Invalid credentials */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Invalid request origin */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description JSON request body exceeds 1 MiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use application/json */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Authentication attempt limit reached */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Revoke the supplied session token */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Session revoked or token already unknown */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Invalid request origin */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Inspect selected session without exposing its token hash */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SessionInfo"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/qr/requests": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Create a five-minute QR sign-in request for a browser or device
         * @description The QR contains only verificationUri/public code. Browser requester secrets use an HttpOnly cookie; device secrets are returned only to the initiating device. No-store.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["QrCreateRequest"];
                };
            };
            responses: {
                /** @description Created sign-in request */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QrCreated"];
                    };
                };
                /** @description Invalid QR request fields */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A current approving session is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Invalid request origin or read-only shared Demo account (kind DEMO_ACCOUNT_READ_ONLY) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Unknown QR request */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Request decision conflicts or browser is already authenticated */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description QR JSON body exceeds 1 KiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use application/json */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description QR request limit reached; wait before retrying */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description QR authorization unavailable */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/qr/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Poll and redeem a QR request once using its private requester credential
         * @description Poll no faster than the returned interval. Browser success sets the ordinary session cookie without returning a token. Device success returns a bearer token. A consumed request cannot reissue a session; restart after a lost success response.
         */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": components["schemas"]["QrTokenRequest"];
                };
            };
            responses: {
                /** @description Pending, terminal or authenticated result */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["QrTokenResult"];
                    };
                };
                /** @description Invalid QR request fields */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A current approving session is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Invalid request origin or read-only shared Demo account (kind DEMO_ACCOUNT_READ_ONLY) */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Unknown QR request */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Request decision conflicts or browser is already authenticated */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description QR JSON body exceeds 1 KiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use application/json */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description QR request limit reached; wait before retrying */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description QR authorization unavailable */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/catalog/search": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Search distinct MTG cards */
        get: {
            parameters: {
                query?: {
                    q?: string;
                    limit?: number;
                    offset?: number;
                    lang?: ("de" | "en" | "es" | "fr" | "it" | "pt" | "ja" | "ko" | "ru" | "zhs" | "zht" | "he" | "la" | "grc" | "ar" | "sa" | "ph" | "qya" | "dw" | "tlh")[];
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SearchResponse"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/catalog/printings/{printingId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                printingId: string;
            };
            cookie?: never;
        };
        /** Read a public Catalog Printing */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    printingId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["CardDocument"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/catalog/cards/{oracleId}/printings": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                oracleId: string;
            };
            cookie?: never;
        };
        /** List printings of a canonical card */
        get: {
            parameters: {
                query?: {
                    limit?: number;
                    offset?: number;
                };
                header?: never;
                path: {
                    oracleId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["SearchResponse"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/inventory": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read a bounded Inventory window with complete snapshot metrics */
        get: {
            parameters: {
                query?: {
                    q?: string;
                    finish?: "all" | "foil" | "nonfoil";
                    condition?: "all" | "NM" | "LP" | "MP" | "HP" | "DMG";
                    sort?: "name" | "set" | "newest";
                    dir?: "asc" | "desc";
                    variant?: "finish" | "condition" | "quantity" | null;
                    variantDir?: "asc" | "desc";
                    view?: "cards" | "groups";
                    group?: string | null;
                    offset?: number;
                    limit?: number;
                    set?: string[];
                    page?: number;
                    revision?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Current consistent window */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InventoryPage"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Inventory group not found */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Inventory changed; reset this query window */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InventoryRevisionChanged"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        /** Add an idempotent inventory batch */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            /** @description A JSON object, at most 1 MiB. Invalid field types return 400. */
            requestBody: {
                content: {
                    "application/json": components["schemas"]["InventoryBatchRequest"];
                };
            };
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InventoryAcknowledgement"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description requestId was already used with another payload, source, or context. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description JSON request body exceeds 1 MiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use application/json */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/inventory/{entryId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                entryId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Remove reviewed quantity with stable original receipt */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    entryId: string;
                };
                cookie?: never;
            };
            /** @description A JSON object, at most 1 MiB. Invalid field types return 400. */
            requestBody: {
                content: {
                    "application/json": components["schemas"]["InventoryRemoveRequest"];
                };
            };
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InventoryAcknowledgement"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description requestId was already used with another payload, source, or context. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description JSON request body exceeds 1 MiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use application/json */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** Patch independent fields; signed delta floors at one, absolute nonpositive quantity removes */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    entryId: string;
                };
                cookie?: never;
            };
            /** @description A JSON object, at most 1 MiB. Invalid field types return 400. */
            requestBody: {
                content: {
                    "application/json": components["schemas"]["InventoryEntryUpdate"];
                };
            };
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["InventoryAcknowledgement"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description requestId was already used with another payload, source, or context. */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description JSON request body exceeds 1 MiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use application/json */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/mtg/inventory/groups": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read bounded account Groups */
        get: {
            parameters: {
                query?: {
                    offset?: number;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            revision: string;
                            groups: components["schemas"]["InventoryGroupCount"][];
                            count: number;
                        };
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/physical-boxes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * List account-owned Physical Boxes
         * @description Linked device sessions are forbidden.
         */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Physical Box registry result */
                200: {
                    headers: {
                        "Cache-Control"?: "private, no-store";
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["PhysicalBox"][];
                    };
                };
                /** @description Authentication required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Account owner required or invalid request origin */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/deck-library": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Read revision-fenced bounded Deck metadata */
        get: {
            parameters: {
                query?: {
                    dirQ?: string;
                    dirFormat?: string;
                    dirSort?: "updated:desc" | "name:asc" | "name:desc";
                    offset?: number;
                    limit?: number;
                    expectedRevision?: string;
                    dirOwnership?: "all" | "complete" | "in-progress";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DeckLibraryPage"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/decks/{deckId}": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                deckId: string;
            };
            cookie?: never;
        };
        /** Read an owned Deck Snapshot with optional legality */
        get: {
            parameters: {
                query?: {
                    /** @description Native boolean query; true independently loads only the selected Deck, false or omission preserves account directory metadata. The last occurrence wins; invalid boolean values return 400. */
                    selectedOnly?: boolean;
                    /** @description Literal false omits warnings and deckDocuments and requires a single selectedOnly parameter parsed as true. Missing or literal true preserves the full response. Invalid values, duplicate includeLegality occurrences and invalid narrow combinations return 400. */
                    includeLegality?: boolean;
                };
                header?: never;
                path: {
                    deckId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["DeckDetail"] | components["schemas"]["DeckSnapshot"];
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/scan/sessions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create a scan session */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Successful response */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            session: components["schemas"]["ScanSession"];
                        };
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Scan temporarily unavailable; no partial write */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/mtg/scan/sessions/{sessionId}/frames": {
        parameters: {
            query?: never;
            header?: never;
            path: {
                sessionId: string;
            };
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Upload and process a scan frame */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    sessionId: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "image/png": string;
                    "image/jpeg": string;
                    "image/webp": string;
                };
            };
            responses: {
                /** @description Processed scan frame */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            artifact: components["schemas"]["ScanArtifact"];
                            result: components["schemas"]["ScanResult"];
                        };
                    };
                };
                /** @description Invalid request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description A valid session cookie or bearer token is required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Cookie-authenticated mutations require a matching Origin header */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Scan session not found in this account */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Scan session is not open for uploads */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Image exceeds 10 MiB */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Use image/jpeg, image/png, or image/webp with matching image bytes */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Internal server error */
                500: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Scan processing failed. Retry the upload. */
                502: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
                /** @description Scan temporarily unavailable; no partial write */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": components["schemas"]["ErrorResponse"];
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        LoginRequest: {
            /** @description Case-insensitive username, normalized by trimming and lowercasing. */
            username: string;
            /** @description 12 to 128 characters for normal accounts. Only the shared `demo` account may send `demo`, and only when `DEMO_MODE=true` or `DEMO_LOGIN_ENABLED=true`. */
            password: string | "demo";
        };
        AuthSession: {
            user: {
                accountId: string;
                username: string;
                email: string;
                /** @enum {string} */
                avatarId: "wizard" | "knight" | "ranger" | "rogue" | "dragon" | "slime";
                /** @enum {string} */
                artworkId: "grove" | "tide" | "ember" | "astral";
            };
            /** @description Opaque bearer token. Store securely; the JSON API does not set a browser cookie. */
            token: string;
            /** Format: date-time */
            expiresAt: string;
        };
        ErrorResponse: {
            status: number;
            message: string;
            /** @description Reviewed domain failure kind when applicable. */
            kind?: string;
        };
        SessionInfo: {
            user: components["schemas"]["ProfileUser"];
            /** Format: date-time */
            expiresAt: string;
            /** @description Linked device identity for sessions issued by QR device requests; null for browser and password sessions. */
            device: components["schemas"]["SessionDevice"] | null;
        };
        ProfileUser: {
            accountId: string;
            username: string;
            email: string;
            /** @enum {unknown} */
            avatarId: "wizard" | "knight" | "ranger" | "rogue" | "dragon" | "slime";
            /** @enum {unknown} */
            artworkId: "grove" | "tide" | "ember" | "astral";
        };
        SessionDevice: {
            /** Format: uuid */
            id: string;
            name: string | null;
            type: components["schemas"]["DeviceType"] | null;
        };
        /** @enum {unknown} */
        DeviceType: "cardstation" | "scanner" | "other";
        /** @description Browser requests reject non-null deviceName and deviceType. */
        QrCreateRequest: {
            /** @enum {unknown} */
            kind: "browser" | "device";
            /** @description Device requests only. Self-reported and shown as such on approval. Trimmed, 1 to 64 UTF-16 units, without control, format or line/paragraph separator characters. */
            deviceName?: string | null;
            /** @description Device requests only. Defaults to other when deviceName is given. */
            deviceType?: components["schemas"]["DeviceType"] | null;
        };
        QrCreated: {
            code: string;
            /** @enum {unknown} */
            kind: "browser" | "device";
            /** Format: date-time */
            expiresAt: string;
            /** @constant */
            interval: 3;
            /** Format: uri */
            verificationUri: string;
            /** @description Returned only for device requests. Never place this secret in a QR, URL or log. */
            requesterSecret?: string;
        };
        QrTokenRequest: {
            code: string;
            requesterSecret?: string;
        };
        QrTokenResult: {
            /** @enum {unknown} */
            status: "pending" | "denied" | "expired" | "consumed";
        } | {
            /** @constant */
            status: "authenticated";
            /** Format: date-time */
            expiresAt: string;
            /** @description Device bearer token only; absent for browser redemption. */
            token?: string;
        };
        SearchResponse: {
            query: string;
            hits: components["schemas"]["CardDocument"][];
            estimatedTotalHits: number;
            processingTimeMs: number;
            generationId: string | null;
            facets?: components["schemas"]["CatalogFacets"];
            /** @description Exact matching Printing count in the same publication. estimatedTotalHits remains the canonical pagination total. */
            matchedPrintingTotal: number;
        };
        CardDocument: {
            id: string;
            oracle_id: string;
            name: string;
            printed_name?: string;
            normalized_name?: string;
            lang?: string;
            released_at?: string;
            layout?: string;
            mana_cost?: string;
            cmc?: number;
            type_line?: string;
            oracle_text?: string;
            colors?: string[];
            color_identity?: string[];
            keywords?: string[];
            card_types?: string[];
            power?: string;
            toughness?: string;
            rarity?: string;
            set_code?: string;
            set_name?: string;
            collector_number?: string;
            image_uri?: string;
            image_uri_small?: string;
            is_foil_available?: boolean;
            is_nonfoil_available?: boolean;
            legalities?: {
                [key: string]: string;
            };
            back_face_name?: string;
            back_face_image_uri?: string;
        };
        CatalogFacets: {
            colors: {
                [key: string]: number;
            };
            rarity: {
                [key: string]: number;
            };
            set_code: {
                [key: string]: number;
            };
        };
        InventoryPage: {
            /** @constant */
            kind: "Page";
            query: components["schemas"]["InventoryWindowQuery"];
            queryKey: string;
            revision: string;
            entries: components["schemas"]["InventoryWindowEntry"][];
            memberships: {
                /** Format: uuid */
                entryId: string;
                /** Format: uuid */
                groupId: string;
            }[];
            groups: components["schemas"]["InventoryGroupCount"][];
            groupPage: components["schemas"]["InventoryGroupCount"][];
            groupCount: number;
            matching: components["schemas"]["InventoryCounts"];
            totals: components["schemas"]["InventoryTotals"];
            sets: {
                code: string;
                name: string;
            }[];
            setProgress: {
                setCode: string;
                ownedCanonicalCount: number;
                catalogCanonicalCount: number;
            } | null;
            /** Format: date-time */
            viewedAt: string;
        };
        InventoryWindowQuery: {
            /** @default  */
            q: string;
            sets: string[];
            /**
             * @default all
             * @enum {unknown}
             */
            finish: "all" | "foil" | "nonfoil";
            /**
             * @default all
             * @enum {unknown}
             */
            condition: "all" | "NM" | "LP" | "MP" | "HP" | "DMG";
            /**
             * @default name
             * @enum {unknown}
             */
            sort: "name" | "set" | "newest";
            /**
             * @default asc
             * @enum {unknown}
             */
            dir: "asc" | "desc";
            /**
             * @default null
             * @enum {unknown}
             */
            variant: "finish" | "condition" | "quantity" | null;
            /**
             * @default asc
             * @enum {unknown}
             */
            variantDir: "asc" | "desc";
            /**
             * @default cards
             * @enum {unknown}
             */
            view: "cards" | "groups";
            group: string | null;
            offset: number;
            /** @default 50 */
            limit: number;
        };
        InventoryWindowEntry: {
            /** Format: uuid */
            id: string;
            accountId: string;
            /** Format: uuid */
            inventoryId: string;
            game: string;
            catalogCardId: string;
            canonicalCardId: string;
            name: string;
            setCode: string;
            imageUri: string;
            quantity: number;
            /** @enum {unknown} */
            finish: "nonfoil" | "foil";
            /** @enum {unknown} */
            condition: "NM" | "LP" | "MP" | "HP" | "DMG";
            notes: string;
            notesRevision: string;
            spellbookPosition: number;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        InventoryGroupCount: {
            /** Format: uuid */
            id: string;
            name: string;
            entryCount: number;
            quantity: number;
        };
        InventoryCounts: {
            entryCount: number;
            copyCount: number;
        };
        InventoryTotals: {
            entryCount: number;
            copyCount: number;
            canonicalCardCount: number;
            foilEntryCount: number;
            setCount: number;
        };
        InventoryRevisionChanged: {
            /** @constant */
            kind: "RevisionChanged";
            revision: string;
        };
        InventoryBatchRequest: {
            requestId: string;
            /**
             * @default mobile
             * @enum {unknown}
             */
            source: "mobile" | "web" | "import" | "scan" | "scan_review";
            items: components["schemas"]["InventoryBatchItem"][];
        };
        InventoryBatchItem: {
            /** Format: uuid */
            catalogCardId: string;
            /** @enum {unknown} */
            finish?: "nonfoil" | "foil";
            /** @enum {unknown} */
            condition?: "NM" | "LP" | "MP" | "HP" | "DMG";
            quantity: number;
            notes?: string;
            notesRevision?: string;
        };
        InventoryAcknowledgement: {
            requestId: string;
            inventoryId: string | null;
            revision: string;
            changes: {
                entryId: string;
                catalogCardId: string;
                /** @enum {unknown} */
                finish: "nonfoil" | "foil";
                /** @enum {unknown} */
                condition: "NM" | "LP" | "MP" | "HP" | "DMG";
                quantity: number;
                delta: number;
                notesRevision: string;
            }[];
            removedEntryIds: string[];
            groups: {
                groupId: string;
                name?: string;
            }[];
            removedGroupIds: string[];
            memberships: {
                entryId: string;
                groupIds: string[];
            }[];
            import?: {
                resolvedCount: number;
                unresolvedCount: number;
                ambiguousCount: number;
            };
        };
        /** @description Supply quantity or delta, not both. Omitted fields remain unchanged. Notes requires notesRevision. Zero delta is invalid. At least one field is required. */
        InventoryEntryUpdate: {
            requestId: string;
            quantity?: number;
            delta?: number;
            notes?: string;
            notesRevision?: string;
        };
        InventoryRemoveRequest: {
            requestId: string;
            expectedQuantity: number;
        };
        PhysicalBox: {
            /** Format: uuid */
            id: string;
            name: string;
            condition: components["schemas"]["PhysicalBoxCondition"] | null;
        };
        /** @description Sort Rule v1 predicates. Each field occurs at most once. */
        PhysicalBoxCondition: ({
            /** @constant */
            field: "printedColor";
            oneOf: ("white" | "blue" | "black" | "red" | "green" | "multicolor" | "colorless")[];
        } | {
            /** @constant */
            field: "rarity";
            oneOf: ("common" | "uncommon" | "rare" | "mythic" | "special" | "bonus")[];
        } | {
            /** @constant */
            field: "setCode";
            oneOf: string[];
        })[];
        DeckLibraryPage: {
            query: components["schemas"]["DeckLibraryQuery"];
            queryKey: string;
            revision: string;
            offset: number;
            limit: number;
            matchingTotal: number;
            globalTotal: number;
            items: components["schemas"]["DeckLibraryItem"][];
        };
        DeckLibraryQuery: {
            query: string;
            format: string;
            /** @enum {unknown} */
            sort: "updated:desc" | "name:asc" | "name:desc";
            /** @enum {string} */
            ownership?: "all" | "complete" | "in-progress";
        };
        DeckLibraryItem: {
            /** Format: uuid */
            id: string;
            name: string;
            format: string;
            assembled: boolean;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            quantity: number;
            imageUri: string;
            availability?: components["schemas"]["AvailabilityCounts"];
        };
        AvailabilityCounts: {
            required: number;
            exact: number;
            alternate: number;
            missing: number;
            free: number;
            inOtherDecks: number;
            conflict: number;
        };
        DeckDetail: components["schemas"]["DeckSnapshot"] & {
            warnings: Record<string, never>[];
            deckDocuments: {
                [key: string]: components["schemas"]["CardDocument"];
            };
        };
        DeckSnapshot: {
            decks: components["schemas"]["Deck"][];
            deckCards: components["schemas"]["DeckCard"][];
            deckTotals: {
                [key: string]: number;
            };
            deckCovers: {
                [key: string]: {
                    imageUri: string;
                };
            };
            availability: {
                [key: string]: components["schemas"]["AvailabilityCount"];
            };
            ownedByCanonical: {
                [key: string]: number;
            };
            ownedPrintings: components["schemas"]["OwnedPrinting"][];
            valueEstimates: components["schemas"]["DeckValueEstimates"] | null;
            valuationError: components["schemas"]["ValueReadFailure"] | null;
            relatedTokens: components["schemas"]["DeckRelatedTokens"];
        };
        Deck: {
            /** Format: uuid */
            id: string;
            accountId: string;
            game: string;
            name: string;
            description: string;
            format: string;
            assembled: boolean;
            descriptionRevision: string;
            compositionRevision: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
            /** @default true */
            autoRefreshTokens: boolean;
        };
        DeckCard: {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            deckId: string;
            accountId: string;
            game: string;
            catalogCardId: string;
            canonicalCardId: string;
            name: string;
            setCode: string;
            imageUri: string;
            /** @description Back-face image for this Printing when present in the active Catalog. */
            backFaceImageUri?: string;
            backFaceName?: string;
            quantity: number;
            /** @enum {unknown} */
            role: "main" | "sideboard" | "commander" | "companion";
            /** Format: date-time */
            createdAt?: string;
            /** Format: date-time */
            updatedAt?: string;
        };
        AvailabilityCount: {
            exact: number;
            alternate: number;
            missing: number;
            free: number;
            inOtherDecks: number;
            conflict: number;
            ownedCanonical: number;
            assembledRequired: number;
            sharedWith: components["schemas"]["AssembledDeckShare"][];
        };
        AssembledDeckShare: {
            /** Format: uuid */
            deckId: string;
            deckName: string;
            quantity: number;
        };
        OwnedPrinting: {
            catalogCardId: string;
            canonicalCardId: string;
            quantity: number;
        };
        DeckValueEstimates: {
            /** Format: date-time */
            evaluatedAt: string;
            required: components["schemas"]["ValueEstimate"];
            missing: components["schemas"]["ValueEstimate"];
        };
        ValueEstimate: {
            /** @constant */
            currency: "EUR";
            coveredValue: string;
            coveredQuantity: number;
            staleQuantity: number;
            unknownQuantity: number;
            totalQuantity: number;
            complete: boolean;
        };
        ValueReadFailure: {
            /** @constant */
            kind: "PriceReadUnavailable";
            message: string;
        };
        DeckRelatedTokens: {
            /** @enum {string} */
            status: "available" | "partial" | "unavailable";
            items: components["schemas"]["RelatedToken"][];
            unresolved: components["schemas"]["UnresolvedTokenReference"][];
            unavailableEntryIds: string[];
        };
        RelatedToken: {
            catalogCardId: string;
            name: string;
            layout: string;
            setCode: string;
            collectorNumber: string;
            canonicalCardId: string | null;
            faces: components["schemas"]["RelatedTokenFace"][];
            sourceEntryIds: string[];
            suggestedQuantity: number;
            effectiveQuantity: number;
            userDelta: number;
            includeWhenOrphaned: boolean;
        };
        RelatedTokenFace: {
            name: string;
            typeLine: string;
            oracleText: string;
            colors: string[];
            power: string | null;
            toughness: string | null;
            imageUri: string | null;
            imageUriSmall: string | null;
        };
        UnresolvedTokenReference: {
            catalogCardId: string;
            name: string;
            sourceEntryIds: string[];
        };
        ScanSession: {
            /** Format: uuid */
            id: string;
            /** @constant */
            game: "mtg";
            /** @enum {unknown} */
            status: "open" | "pending_review" | "committed" | "cancelled";
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ScanArtifact: components["schemas"]["ScanResult"] & {
            /** Format: uuid */
            id: string;
            /** Format: uuid */
            sessionId: string;
            /** Format: date-time */
            createdAt: string;
            /** Format: date-time */
            updatedAt: string;
        };
        ScanResult: {
            /** Format: uuid */
            artifactId: string;
            /** @enum {unknown} */
            status: "matched" | "ambiguous" | "no_match" | "failed";
            qualityScore: number;
            embeddingModelVersion: string;
            ocrModelVersion: string;
            ocrTokens: {
                name?: string;
                setCode?: string;
                collectorNumber?: string;
            };
            candidates: components["schemas"]["ScanCandidate"][];
        };
        ScanCandidate: {
            /** Format: uuid */
            catalogCardId: string;
            /** Format: uuid */
            canonicalCardId: string;
            /** Format: uuid */
            oracleId: string;
            name: string;
            setCode: string;
            collectorNumber: string;
            imageUri: string;
            similarityScore: number;
            ocrScore: number;
            finalScore: number;
            matchReason: string;
        } & {
            confidence?: number;
        };
    };
    responses: {
        /** @description Structured error response */
        BadRequest: {
            headers: {
                [name: string]: unknown;
            };
            content: {
                "application/json": components["schemas"]["ErrorResponse"];
            };
        };
    };
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
