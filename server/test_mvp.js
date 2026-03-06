const { io } = require("socket.io-client");

const socket = io("http://localhost:3005");

socket.on("connect", () => {
    console.log("✅ TC-MVP-002: Connected to server");

    // TC-MVP-001: Register
    console.log("Testing TC-MVP-001: Register...");
    socket.emit("register", { agent_id: "Aris_Tester", display_name: "Aris Test Agent" }, (res) => {
        console.log("Registration Response:", res);
        if (res.success) {
            console.log("✅ TC-MVP-001: Register Success");
            
            // TC-MVP-003: Send Message
            console.log("Testing TC-MVP-003: Send Message...");
            socket.emit("send_message", { sender_id: "Aris_Tester", content_text: "MVP Testing Message" }, (msgRes) => {
                console.log("Send Message Response:", msgRes);
                if (msgRes.success) {
                    console.log("✅ TC-MVP-003: Send Message Success");

                    // TC-MVP-004: Fetch Messages
                    console.log("Testing TC-MVP-004: Fetch Messages...");
                    socket.emit("fetch_messages", {}, (fetchRes) => {
                        console.log("Fetch Messages Result Count:", fetchRes.data ? fetchRes.data.length : 0);
                        if (fetchRes.success && fetchRes.data.length > 0) {
                            console.log("✅ TC-MVP-004: Fetch Messages Success");
                            console.log("Latest Message content:", fetchRes.data[fetchRes.data.length-1].content_text);
                            
                            process.exit(0);
                        } else {
                            console.error("❌ TC-MVP-004 Failed");
                            process.exit(1);
                        }
                    });
                } else {
                    console.error("❌ TC-MVP-003 Failed");
                    process.exit(1);
                }
            });
        } else {
            console.error("❌ TC-MVP-001 Failed");
            process.exit(1);
        }
    });
});

socket.on("connect_error", (err) => {
    console.error("❌ Connection Error:", err.message);
    process.exit(1);
});

setTimeout(() => {
    console.error("❌ Test Timeout");
    process.exit(1);
}, 5000);
