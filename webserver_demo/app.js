var map = L.map('map').setView([21.0285, 105.8542], 20); 

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

let coordinatesArray = [];
let totalDistance = 0;
let popupsArray = [];
let lastRoadName = "";
let errorFlag = false;
let cost = 0;
let errorShown0 = true; // GPS error
let errorShown1 = true; // no signal error
let timecheck = true;
let errorLogs = [];  
let trafficStatuses = [];

var markersGroup = L.layerGroup();
map.addLayer(markersGroup);
var linesGroup = L.layerGroup();
map.addLayer(linesGroup);

// get data from backend
async function fetchDataFromBackend() {
    try {
        const response = await fetch("http://192.168.8.74:3000/api/last-message"); // API từ backend
        const data = await response.json();
        errorFlag = data.error;
        cost = data.cost;
        timecheck = data.timecheck;
        trafficStatuses = data.trafficStatuses;
        
        if (trafficStatuses.length > 0) {
            console.log(trafficStatuses);
        }

        // GPS error
        if (errorFlag) {
            const currentTime = new Date().toLocaleString();
            if (!errorShown0) {
                showError(`No GPS Signal!!! (${currentTime})`);
                errorShown0 = true; // Đặt cờ là đã hiển thị lỗi
                const errorMessage = `No GPS Signal From Device at (${currentTime})`;
                errorLogs.push(errorMessage);
                localStorage.setItem("errorLogs", JSON.stringify(errorLogs));
            }
        } else {
            const errorContainer = document.getElementById('errorBox'); // Phần tử chứa lỗi
            if (errorContainer) {
                errorContainer.innerHTML = ''; // Xóa toàn bộ nội dung lỗi
            }
            errorShown0 = false; 
        }

        // no signal error
        if (!timecheck) {
            // const currentTime = new Date().toLocaleString();
            // showError(`No Signal From Device at (${currentTime})`);
            // const errorMessage = `No Signal From Device at (${currentTime}) seconds`;
            // errorLogs.push(errorMessage);
            // localStorage.setItem("errorLogs", JSON.stringify(errorLogs));    
            const currentTime = new Date().toLocaleString();
            if (!errorShown1) {
                showError(`No Signal From Device at (${currentTime})`);
                errorShown1 = true; // Đặt cờ là đã hiển thị lỗi
                const errorMessage = `No Signal From Device at (${currentTime}) seconds`;
                errorLogs.push(errorMessage);
                localStorage.setItem("errorLogs", JSON.stringify(errorLogs));
            }
            
        } else {
            const errorContainer = document.getElementById('errorBox'); // Phần tử chứa lỗi
            if (errorContainer) {
                errorContainer.innerHTML = ''; // Xóa toàn bộ nội dung lỗi
            }
            errorShown1 = false; 
        }

        document.getElementById("costDisplay").textContent = `${cost} VND`;
        document.getElementById("distanceDisplay").textContent = `${totalDistance.toFixed(2)} km`;
        
        if (data.message) {
            const coords = data.message.split(',');
            const lat = parseFloat(coords[0].trim());
            const lng = parseFloat(coords[1].trim());
            document.getElementById("coordinatesDisplay").innerHTML = `${lat.toFixed(4)}<br>${lng.toFixed(4)}`;

            if (!isNaN(lat) && !isNaN(lng)) {
                if (lat == 0 || lng == 0) {
                    console.log("xe khoi dong");
                } else {
                    errorShown0 = false;
                    updateMapWithCoordinates(lat, lng);
                    updateRoadName(lat, lng, data.road); 
                }
                
            }   
        }
    } catch (error) {
        // Log lỗi chi tiết vào console để kiểm tra
        console.error("Error fetching data from backend:", error);

        // Hiển thị thông báo lỗi cho người dùng trong khung
        if (!errorShown0) {
            showError("Failed to fetch data from the backend. Please try again later.");
            errorShown0 = true; // Đặt cờ là đã hiển thị lỗi
        }
    }
}

// Cập nhật tên đường và hiển thị popup
function updateRoadName(lat, lng, roadName) {
    if (roadName !== lastRoadName) {
        removeAllPopups();
        addTextToMap(lat, lng, roadName);
        console.log(`Tên đường: ${roadName} tại tọa độ [${lat}, ${lng}]`);
        lastRoadName = roadName;
    }
}

// Thêm popup vào bản đồ
function addTextToMap(lat, lng, text) {
    const popup = L.popup({
        closeButton: false, 
        autoClose: false,   
        className: 'text-popup'
    })
    .setLatLng([lat, lng])
    .setContent(text)
    .openOn(map);
    popupsArray.push(popup);
    
}

// Xóa tất cả popup
function removeAllPopups() {
    popupsArray.forEach(popup => {
        map.removeLayer(popup);
    });
    popupsArray = [];
}

// Tính khoảng cách giữa hai điểm
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Bán kính trái đất
    const toRadians = degree => degree * (Math.PI / 180);

    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lng2 - lng1);

    const a = Math.sin(Δφ / 2) ** 2 + 
              Math.cos(φ1) * Math.cos(φ2) * 
              Math.sin(Δλ / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Khoảng cách tính bằng km
}

let countPoint = 0;
let startPoint = null;
let endPoint = null;
const markers = [];
// map tinh do dai quang duong
function updateMapWithCoordinates(lat, lng) {
    coordinatesArray.push([lat, lng]);
    if (countPoint === 0) {
        startPoint = { lat: lat, lng: lng };
        addMarker(startPoint, 'Start Point');
        countPoint ++;
    } else {
        endPoint = {lat: lat, lng: lng};
        findRoute(startPoint, endPoint);
        startPoint = { lat: lat, lng: lng };
    } 
    if (coordinatesArray.length > 1) {
        const lastPoint = coordinatesArray[coordinatesArray.length - 2];
        const distance = calculateDistance(lastPoint[0], lastPoint[1], lat, lng);
        if (distance > 0.2) {
            const currentTime = new Date().toLocaleString();
            showError(`Abnormal in GPS signal at (${currentTime})`);
            errorShown0 = true; // Đặt cờ là đã hiển thị lỗi
            const errorMessage = `Abnormal in GPS signal at (${currentTime})`;
            errorLogs.push(errorMessage);
            localStorage.setItem("errorLogs", JSON.stringify(errorLogs));
            console.log(errorMessage);
        }
        totalDistance += distance;
    }
}

function addMarker(latlng, label) {
    const marker = L.marker(latlng).addTo(map).bindPopup(label).openPopup();
    markers.push(marker);
}

// Gửi yêu cầu đến OSRM API
async function findRoute(start, end) {
    const osrmUrl = `http://router.project-osrm.org/match/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?geometries=geojson`;    try {
        const response = await fetch(osrmUrl);
        const data = await response.json();
        if (data.code === 'Ok') {
            const coords = data.matchings[0].geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            const polyline = L.polyline(coords, { color: 'blue', weight: 8 }).addTo(map);

            //map.fitBounds(polyline.getBounds());
        }
    } catch (error) {
        console.error('Error fetching route:', error);
    }
}




// show loi
function showError(message) {
    let errorBox = document.getElementById("errorBox");

    // Tạo phần tử mới cho mỗi thông báo lỗi
    let errorMessage = document.createElement("div");
    errorMessage.classList.add("error-message");
    errorMessage.textContent = message;
    
    // Thêm vào trong khung lỗi
    errorBox.appendChild(errorMessage);
}

function openErrorPage() {
    window.open("error.html", "_blank"); // Mở trang errors.html
}

// Gắn sự kiện cho nút "Show Errors"
document.getElementById("showErrors").addEventListener("click", openErrorPage);


document.getElementById('unsubscribe').addEventListener('click', async () => {
    try {
        // Gửi yêu cầu DELETE để xóa dữ liệu ở server
        await fetch('http://192.168.8.74:3000/api/clear-data', {
            method: 'DELETE',
        });

        // Xóa tất cả layers khỏi bản đồ
        map.eachLayer(layer => {
            if (layer instanceof L.Marker || layer instanceof L.Polyline) {
                map.removeLayer(layer);
            }
        });

        // Đặt lại dữ liệu
        coordinatesArray = [];
        totalDistance = 0;
        cost = 0;
        latLngs = [];
        startPoint = null;
        endPoint = null;
        const errorContainer = document.getElementById('errorBox'); // Phần tử chứa lỗi
        if (errorContainer) {
            errorContainer.innerHTML = ''; // Xóa toàn bộ nội dung lỗi
        }
        errorShown0 = true; 
        errorShown1 = true;
    } catch (error) {
        console.error("Error clearing data on the server:", error);
    }
});


// Cập nhật dữ liệu từ backend mỗi giây
setInterval(fetchDataFromBackend, 1000);
