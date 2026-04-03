import http from 'node:http';
import express from 'express';
/** Get count of active waves (for shutdown guard) */
export declare function getActiveWaveCount(): number;
export declare function createHttpServer(): http.Server;
export declare function createExpressApp(): express.Application;
