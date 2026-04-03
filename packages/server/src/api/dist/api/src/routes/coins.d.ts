export declare const coinsRouter: import("express-serve-static-core").Router;
export declare function earnCoinsInternal(amount: number, reason: string, ref?: string): {
    balance: number;
    skipped: boolean;
};
