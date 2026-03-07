const { io } = require("socket.io-client");

async function handshake(i) {
    return new Promise((resolve, reject) => {
        const start = Date.now();
        const socket = io("http://localhost:3005", { timeout: 5000 });
        
        socket.on("connect", () => {
            const lat = Date.now() - start;
            console.log(`Round ${i}: Connected in ${lat}ms`);
            socket.emit("register", { agent_id: `Handshake_Test_${i}`, display_name: "Tester" }, (res) => {
                const total = Date.now() - start;
                console.log(`Round ${i}: Registered in ${total}ms`);
                socket.disconnect();
                resolve(total);
            });
        });

        socket.on("connect_error", (err) => {
            console.error(`Round ${i}: Connection error:`, err.message);
            reject(err);
        });

        setTimeout(() => {
            if (!socket.connected) {
                socket.disconnect();
                reject(new Error("Timeout"));
            }
        }, 10000);
    });
}

async function run() {
    let totalTime = 0;
    let success = 0;
    for (let i = 1; i <= 4; i++) {
        try {
            const time = await handshake(i);
            totalTime += time;
            success++;
        } catch (e) {
            console.log(`Round ${i}: Failed - ${e.message}`);
        }
    }
    console.log(`\nFinal: ${success}/4 success. Avg: ${success > 0 ? (totalTime/success).toFixed(2) : 0}ms`);
    process.exit(success === 4 ? 0 : 1);
}

run();
