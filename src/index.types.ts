export type WorkerMessage = {
    uid: string,
    method: string,
    pathname: string,
    body: Record<string, unknown>,
    ql: string,
};

export type WorkerResponse = {
    uid?: string,
    status: number,
    text?: string,
    json?: Record<string, unknown>,
};
