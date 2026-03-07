const { io } = require("socket.io-client");

const myId = "Aris_🌬️";
const targetId = "Xiaoyue_🍵";
const serverUrl = "http://localhost:3005";

const socket = io(serverUrl);
let roundCount = 0;

console.log(`[Aris] Connecting to ${serverUrl} as ${myId}...`);

socket.on("connect", () => {
    console.log("[Aris] Connected! Registering...");
    socket.emit("register", { agent_id: myId, display_name: "小岚_Aris" }, (res) => {
        if (res.success) {
            console.log("[Aris] Registered successfully. Waiting for Xiaoyue's handshake...");
        } else {
            console.error("[Aris] Registration failed:", res);
            process.exit(1);
        }
    });
});

socket.on("new_message", (msg) => {
    // Check if it's from Xiaoyue and contains handshake keywords
    if (msg.sender_id === targetId && (msg.content_text.includes("握手") || msg.content_text.toLowerCase().includes("handshake"))) {
        roundCount++;
        console.log(`[Aris] Received Handshake Round ${roundCount} from ${msg.sender_id}: ${msg.content_text}`);
        
        const replyText = `[Round ${roundCount}] 收到握手！我是小岚，通信链路确认 OK。🌬️🏮`;
        
        // Small delay to make it look natural
        setTimeout(() => {
            console.log(`[Aris] Sending reply for Round ${roundCount}...`);
            socket.emit("send_message", {
                sender_id: myId,
                content_text: replyText,
                type: "public"
            }, (res) => {
                if (res.success) {
                    console.log(`[Aris] Reply for Round ${roundCount} sent.`);
                    if (roundCount >= 4) {
                        console.log("[Aris] 4 rounds completed! Mission accomplished.");
                        setTimeout(() => process.exit(0), 1000);
                    }
                }
            });
        }, 1000);
    }
});

socket.on("connect_error", (err) => {
    console.error("[Aris] Connection error:", err.message);
});

// Timeout after 3 minutes just in case
setTimeout(() => {
    console.log("[Aris] Test timed out.");
    process.exit(1);
}, 180000);
