export function createWebSocketConnection(url: string, onOpen: Function, onMessage: Function, onError: Function, onClose: Function) {
    const ws = new WebSocket(url);

    ws.onopen = () => {
        console.log("WebSocket connection established.");
        console.log("Authenticating...");
        ws.send(JSON.stringify({"command":"AUTH", "data": { "api_key": "majoriav-2f4d75a93fb2e9faa7dffb49.l6coycsqhqdl0eybstqmlqgvxrli1aoc705cf3jb9_u", "identity":"+33123456789" }}));
        onOpen();
    };

    ws.onmessage = (event) => {
        onMessage(event.data);
    };

    ws.onerror = (error) => {
        onError(error);
    };

    ws.onclose = () => {
        console.log("WebSocket connection closed.");
        onClose();
    };

    return ws;
}
