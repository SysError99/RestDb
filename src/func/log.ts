export const log = (message: string) => {
    console.log(`[${new Date().toUTCString()}] ${message}`);
};
