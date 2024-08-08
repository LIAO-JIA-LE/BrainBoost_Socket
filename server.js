const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const userSockets = new Map();
const app = express();
app.use(cors());

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:3000",
      "http://localhost:8000",
      "http://localhost:8001",
    ],
    methods: ["GET", "POST"],
  },
});

app.get("/", (req, res) => {
  res.send("Server is running");
});

// io.on('connection', (socket) => {
//   getGuestListApi();
//   console.log('A user connected');

//   socket.on('disconnect', () => {
//     console.log('User disconnected');
//     clearInterval(interval);
//   });

//   socket.on('message', (msg) => {
//     console.log(msg);
//     io.emit('message', msg);
//   });

//   // socket.on('GuestList', () => {
//   //   console.log(msg);
//   //   io.emit('message', msg);
//   // });

//   // 定時推送數據
//   const interval = setInterval(() => {
//     axios.get(API_URL + '/Guest/GuestList?roomId=6')
//       .then(response => {
//         console.log("定時推送數據：", response.data);
//         const data = response.data;
//         socket.emit('regular', data.data.guestNameList);
//       })
//       .catch(error => {
//         console.error('Error fetching data:', error);
//       });
//   }, 3000);
// });

const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || "http://localhost:5001/BrainBoost";

const getGuestListApi = async (roomUseId) => {
  try {
    console.log("=========進入取得訪客列表Function=========");
    const response = await axios.get(
      `${API_URL}/Guest/GuestList?roomUseId=${roomUseId}`
    );
    const data = response.data;
    console.log("Data from getGuestListApi:", data.data.guestNameList);

    // 廣播給所有房間中的用戶
    JoinRoom.to(roomUseId).emit("GuestListResponse", data.data.guestNameList);
    console.log("=========function執行完成=========");
  } catch (error) {
    console.error(
      `Error fetching data from ${API_URL}/Guest/GuestList?roomUseId=${roomUseId}:`,
      error
    );
  }
};

// 用於驗證token並獲取用戶信息
const verifyToken = async (token) => {
  try {
    const response = await axios.get(`${API_URL}/Guest/GuestInfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.data;
    console.log("使用者資訊", data.data);
    return data.data;
  } catch (error) {
    console.error("Token verification failed:");
    return null;
  }
};
const verifyTeacherToken = async (token) => {
  try {
    const response = await axios.get(`${API_URL}/User/MySelf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.data;
    console.log("老師資訊", data.data.userName);
    return data.data;
  } catch (error) {
    console.error("Token verification failed:");
    return null;
  }
};

const JoinRoom = io.of("/JoinRoom");
JoinRoom.on("connection", (socket) => {
  console.log("A Teacher connected");
  socket.on("TjoinRoom", async (token,roomUseId) => {
    const user = await verifyTeacherToken(token);
    if (user === null || !user) {
      socket.emit("error", "Invalid token");
      return;
    }
    console.log("Teacher connected:", user.guestName);

    // const roomUseId = user.roomUseId;
    socket.join(roomUseId);
    console.log("目前使用者Socket.room", socket.rooms);

    getGuestListApi(roomUseId);

    JoinRoom.to(roomUseId).emit("joinedRoom", { roomUseId });

    console.log("joinedRoom emit 完成");

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });
  socket.on("joinRoom", async (token) => {
    const user = await verifyToken(token);
    if (user === null || !user) {
      socket.emit("error", "Invalid token");
      return;
    }
    console.log("A user connected:", user.guestName);

    const roomUseId = user.roomUseId;
    socket.join(roomUseId);
    console.log("目前使用者Socket.room", socket.rooms);

    getGuestListApi(roomUseId);

    JoinRoom.to(roomUseId).emit("joinedRoom", { roomUseId });

    console.log("joinedRoom emit 完成");

    socket.on("disconnect", () => {
      console.log("User disconnected");
    });
  });
});

//#region 以下為開始搶答後的socket

// 獲取並推送當前房間的題目
const pushQuestion = async () => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/RoomRandomQuestion?roomUseId=${roomUseId}`
    );
    const question = response.data;
    io.to(roomId).emit("newQuestion", question);
  } catch (error) {
    console.error("Error fetching question:", error);
  }
};

io.of("/Start").on("connection", (socket) => {
  console.log("A user connected");
  pushQuestion();
});

// // 立即推送一次題目

// // 獲取該房間的時間限制並定時推送新題目
// const timeLimitResponse = await axios.get(
//   `${API_URL}/api/room/${roomId}/timeLimit`
// );
// const timeLimit = timeLimitResponse.data.timeLimit;

// const interval = setInterval(pushQuestion, timeLimit);

// socket.on("disconnect", () => {
//   clearInterval(interval);
//   console.log("User disconnected:", socket.id);
// });
// });

// socket.on("answer", async ({ token, answer }) => {
// const user = await verifyToken(token);
// if (!user) {
//   socket.emit("error", "Invalid token");
//   return;
// }

// const roomId = user.roomId;
// try {
//   const response = await axios.post(
//     `${API_URL}/api/room/${roomId}/answer`,
//     { userId: user.id, answer }
//   );
//   const result = response.data;
//   io.to(roomId).emit("answerResult", result);
// } catch (error) {
//   console.error("Error submitting answer:", error);
//   socket.emit("error", "Failed to submit answer");
// }
// });
//#endregion

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
