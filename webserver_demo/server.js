const mqtt = require("mqtt");
const express = require("express");
const cors = require("cors");
const axios = require("axios");
const roadCosts = require("./roadCost.json");

const app = express();
const PORT = 3000;
const OPEN_CAGE_API_KEY = "d8eecdb7c18c45439d299b898ea41699";


app.use(cors());
app.use(express.json());

const mqttBrokerUrl = "wss://broker.emqx.io:8084/mqtt";
const mqttClient = mqtt.connect(mqttBrokerUrl);

let lastRoadName = "";
let lastMessage = "";
let receiveMess = "";
let cost = 0;
let trafficStatuses = [];
let errorFlag = false;

mqttClient.on("connect", () => {
    console.log("Connected to MQTT broker");
    mqttClient.subscribe("testelcol", () => {
        console.log("Subscribed to testelcom topic");
    });
});

// hàm chuẩn hóa, bỏ dấu
function removeDiacritics(str) {
    return str
        .normalize("NFD") // Chuẩn hóa chuỗi để tách các dấu
        .replace(/[\u0300-\u036f]/g, "") // Xóa các dấu
        .replace(/đ/g, "d") // Thay thế chữ "đ" thành "d"
        .replace(/Đ/g, "D")
        .replace(/Ê/g, "E")
        .replace(/ê/g, "e")
        .replace(/Ô/g, "O")
        .replace(/ô/g, "o")
        .replace(/Ơ/g, "o")
        .replace(/ơ/g, "o")
        .toLowerCase(); // Thay thế chữ "Đ" thành "D"
}

let roadCount = 0;
let timeout; // Lưu trữ ID của timeout
const TIMEOUT_DURATION = 3000;
let timecheck = true;

function resetTimeout() {
    // Xóa timeout cũ nếu tồn tại
    if (timeout) {
        clearTimeout(timeout);
    }

    // Tạo timeout mới
    timeout = setTimeout(() => {
        timecheck = false;
    }, TIMEOUT_DURATION);

}

// server xử lý toạ độ
mqttClient.on("message", async (topic, message) => {
    console.log(`Received: ${message.toString()} on topic ${topic}`);
    lastMessage = message.toString();
    timecheck = true;
    resetTimeout();

    const [lat, lng] = lastMessage.split(",");

    if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
        console.error("Invalid message format. Expected format: 'lat,lng'");
        //mqttClient.publish("testelcomp", "No GPS signal");
        errorFlag = true;
        return; 
    } else {
        errorFlag = false;
    }

    if (lat && lng) {
        const roadName = await getStreetName(parseFloat(lat), parseFloat(lng));
        const road = removeDiacritics(roadName);
        

        if (road !== lastRoadName) {
            roadCount = 0;
            lastRoadName = road;
        } else {
            roadCount++;
            if (roadCount === 3) { // nhan cung 1 ten duong 3 lan thi moi cong phi => tranh sai so
                if (roadCosts[road]) {
                    cost += roadCosts[road];
                    const blank = "cost:     ";
                    mqttClient.publish("testelcoml", blank);
                    const receiveMess = "cost: " + cost;
                    mqttClient.publish("testelcoml", receiveMess);
                    console.log(`Cost updated: ${cost}`);                    
                } else {
                    console.log("No cost for this road.");
                    const blank = "cost:     ";
                    mqttClient.publish("testelcoml", blank);
                    const receiveMess = "cost: " + cost;
                    mqttClient.publish("testelcoml", receiveMess);
                }
       
            } else if (roadCount === 5) {
                const intersections = await getIntersections(lat, lng, roadName);
                //console.log(intersections);
                for (const intersection of intersections) {
                    const status = await getTrafficStatus(lat, lng); 
                    if (status=== "Heavy Traffic") {
                        trafficStatuses.push(`${intersection},`);
                    }
                }
                console.log(trafficStatuses);
                //const roadMess = "road: " + trafficStatuses;
                //mqttClient.publish("testelcomp", roadMess);
            } 
            else {
                const receiveMess = "cost: " + cost;
                const blank = "cost:     ";
                mqttClient.publish("testelcoml", blank);
                mqttClient.publish("testelcoml", receiveMess);
            }
        }
    }
});


async function getStreetName(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`;

    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'YourAppName/1.0 (manhpv1@elcom.com.vn)' // Cung cấp User-Agent
            }
        });
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        const roadName = data.address.road || "Unnamed Road";
        return roadName;
    } catch (error) {
        console.error("Error fetching street name:", error);
        return "Error fetching road name";
    }
}
const ignoreKeywords = ["ngõ", "ngách", "hẻm", "alley", "đường nhỏ"];
// hàm lấy đường giao
async function getIntersections(lat, lon, roadName) {
    const query = `
        [out:json];
        way(around:1000, ${lat}, ${lon})["name"="${roadName}"]["highway"];
        node(w);
        way(bn)["highway"];
        out tags;
    `;

    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.elements && data.elements.length > 0) {
            const intersections = new Set();
            data.elements.forEach(element => {
                if (element.tags && element.tags.name) {
                    // Filter out minor roads
                    const name = element.tags.name;
                    if (!ignoreKeywords.some(keyword => name.toLowerCase().includes(keyword))) {
                        intersections.add(name);
                    }
                }
            });

            return Array.from(intersections); // Return unique road names
        } else {
            return [];
        }
    } catch (error) {
        console.error("Error fetching road data:", error);
        return [];
    }
}

const TOMTOM_API_KEY = "an3iZV1eIoJS0UqOK74G6MHIHaGv6ETr";
// hàm lấy thông tin đường tắc
async function getTrafficStatus(lat, lng) {
    const url = `https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=${lat},${lng}&key=${TOMTOM_API_KEY}`.replace(/\s/g, "");
    try {
        const response = await axios.get(url, { timeout: 10000 }); // Thêm timeout 10 giây
        const data = response.data;

        if (data && data.flowSegmentData) {
            const currentSpeed = data.flowSegmentData.currentSpeed;
            const freeFlowSpeed = data.flowSegmentData.freeFlowSpeed;
            const congestion = currentSpeed / freeFlowSpeed;

            if (congestion < 0.5) {
                return "Heavy Traffic";
            } else if (congestion < 0.65) {
                return "Moderate Traffic";
            } else {
                return "Light Traffic";
            }
        } else {
            return "Traffic data unavailable\n";
        }
    } catch (error) {
        console.error("Error fetching traffic status:", error);
        return "Error fetching traffic data";
    }
}



// kiem tra giao thong tai cuoi con duong

app.get("/api/last-message", (req, res) => {
    res.json({ 
        message: lastMessage, 
        road: lastRoadName,
        error: errorFlag,
        cost: cost,
        timecheck: timecheck,
        trafficStatuses: trafficStatuses
     });
});

app.delete('/api/clear-data', (req, res) => {
    lastMessage = ""; 
    lastRoadName = ""; 
    console.log('Data cleared');
    cost = 0;
    trafficStatuses = [];
    res.status(200).send('Data cleared');
});

app.listen(3000, '0.0.0.0', () => {
    console.log('Server is running on http://0.0.0.0:3000');
});