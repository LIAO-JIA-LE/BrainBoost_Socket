const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const axios = require("axios");
const { verify } = require("crypto");

const userSockets = new Map();
const app = express();
app.use(cors());

let QuestionData = {};
let roomPeople = [];

const server = http.createServer(app);
//#region socket.io設定(cros)
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
//#endregion

app.get("/", (req, res) => {
  res.send("Server is running");
});


const PORT = process.env.PORT || 3001;
const API_URL = process.env.API_URL || "http://localhost:5001/BrainBoost";

//#region 取得訪客列表
const getGuestListApiandEmit = async (roomUseId) => {
  try {
    // console.log("=========進入取得訪客列表Function=========");
    const response = await axios.get(
      `${API_URL}/Guest/GuestList?roomUseId=${roomUseId}`
    );
    const data = response.data;
    // console.log("Data from getGuestListApi:", data.data.guestNameList);

    // 廣播給所有房間中的用戶
    JoinRoom.to(roomUseId).emit("GuestListResponse", data.data.guestNameList);
    // console.log("=========function執行完成=========");
  } catch (error) {
    console.error(
      `Error fetching data from ${API_URL}/Guest/GuestList?roomUseId=${roomUseId}:`,
      error
    );
  }
};
const getGuestListApi = async (roomUseId) => {
  try {
    // console.log("=========進入取得訪客列表Function=========");
    const response = await axios.get(
      `${API_URL}/Guest/GuestList?roomUseId=${roomUseId}`
    );
    const data = response.data;

    return data.data.guestNameList;
    // console.log("=========function執行完成=========");
  } catch (error) {
    console.error(
      `Error fetching data from ${API_URL}/Guest/GuestList?roomUseId=${roomUseId}:`,
      error
    );
  }
};
//#endregion

//#region 學生驗證
const verifyToken = async (token) => {
  try {
    const response = await axios.get(`${API_URL}/Guest/GuestInfo`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.data;
    // console.log("使用者資訊", data.data);
    return data.data;
  } catch (error) {
    console.error("Token verification failed:");
    return null;
  }
};
//#endregion

//#region 教師驗證
const verifyTeacherToken = async (token) => {
  try {
    // console.log("Teacher Token=>", token);
    const response = await axios.get(`${API_URL}/User/MySelf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.data;
    // console.log("老師資訊", data.data.userName);
    return data.data;
  } catch (error) {
    console.error("Teacher Token verification failed:");
    return null;
  }
};
//#endregion

//#region JoinRoom
const JoinRoom = io.of("/JoinRoom");
JoinRoom.on("connection", (socket) => {
  console.log("A User connected");

  //#region 教師加入房間
  socket.on("TjoinRoom", async (res) => {
    // console.log("Teacher Info=>", res);
    const token = res[0];
    const roomUseId = res[1];
    const user = await verifyTeacherToken(token);
    if (user === null || !user) {
      socket.emit("error", "Invalid token");
      return;
    }
    console.log("Teacher connected:", user.userName);

    socket.join(roomUseId);

    getGuestListApiandEmit(roomUseId);
    
    socket.on("disconnect", () => {
      console.log("Teacher disconnected");
    });
  });
  //#endregion

  //#region 訪客加入房間
  socket.on("joinRoom", async (token) => {
    const user = await verifyToken(token);
    if (user === null || !user) {
      socket.emit("error", "Invalid token");
      return;
    }
    console.log("A guest connected:", user.guestName);

    const roomUseId = user.roomUseId;
    socket.join(roomUseId);
    // console.log("目前使用者Socket.room", socket.rooms);

    getGuestListApiandEmit(roomUseId);

    JoinRoom.to(roomUseId).emit("joinedRoom", { roomUseId });

    // console.log("joinedRoom emit 完成");

    socket.on("disconnect", () => {
      getGuestListApiandEmit(roomUseId);
      console.log("guest disconnected");
    });
  });
  //#endregion
});
//#endregion

//#region 開始搶答後的socket

// 獲取並推送當前房間的題目
const pushQuestion = async (namespace,token,roomUseId) => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/RoomRandomQuestion?roomUseId=${roomUseId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const question = response.data;
    namespace.to(roomUseId).emit("newQuestion", question.data);
  } catch (error) {
    console.error("Error fetching question:", error);
  }
};
// 取得房間資訊
const verifyRoom = async (token,roomUseId) => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/ByRoomUseId?roomUseId=${roomUseId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = response.data;
    return data.data;
  } catch (error) {
    console.error("Room verification failed:",roomUseId);
    return null;
  }
};

// 老師開啟房間
const TStartRoom = (token,roomUseId) => {
  try{
    console.log("TStartRoom payload=>",token,roomUseId);
    const response = axios.post(`${API_URL}/Room/StartRoom`,
      roomUseId
      ,{
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.data;
    console.log("TStartRoom",data);
    return data;
  }
  catch (error) {
    console.error("TStartRoom verification failed:");
    return null;
  }
};

//#region StartRoom
const StartRoom = io.of("/StartRoom");
StartRoom.on("connection", (socket) => {
  console.log("A user connected");
    //#region 教師加入房間
    socket.on("TStartRoom", async (res) => {
      // console.log("Teacher Info=>", res);
      const token = res[0];
      const roomUseId = res[1];
      const user = await verifyTeacherToken(token);
      if (user === null || !user) {
        socket.emit("error", "Invalid token");
        return;
      }
      console.log("Teacher connected:", user.userName);
      
      // 確認房間資訊
      const roomInfo = await verifyRoom(token,roomUseId);
      if (roomInfo === null || !roomInfo) {
        socket.emit("error", "Invalid room");
        return;
      }
      socket.join(roomUseId);

      // 老師開始房間
      if(TStartRoom(token,roomUseId).status_code == 400){
        console.log("開始房間回傳",res);
        socket.emit("error", res.message);
      }
      else{
        console.log("開始房間回傳",res);
        // 老師開始房間後，通知所有訪客
        JoinRoom.to(roomUseId).emit("StartRoom", { roomUseId });
      }

      
      // 等待所有訪客加入後，開始推播題目
      socket.on("GuestJoin", async (guestName) => {
        roomPeople.push(guestName);
        if(getGuestListApi(roomUseId).length === roomPeople.length){
          pushQuestion(StartRoom,token,roomUseId);
          StartRoom.to(roomUseId).emit("newQuestion", { roomUseId });
        }
      });
      // pushQuestion(StartRoom,roomUseId);
      // StartRoom.to(roomUseId).emit("Question", { roomUseId });
  
      // console.log("joinedRoom emit 完成");
      // 設定一個定時推播題目的間隔
      const intervalId = setInterval(() => {
        pushQuestion(StartRoom,token,roomUseId);
      }, roomInfo.timeLimit);
  
      socket.on("disconnect", () => {
        if(roomPeople.length === 0){
          clearInterval(intervalId);
        }
        console.log("Teacher disconnected");
      });
    });
    //#endregion
  
    //#region 訪客加入房間
    socket.on("joinRoom", async (token) => {
      const user = await verifyToken(token);
      if (user === null || !user) {
        socket.emit("error", "Invalid token");
        return;
      }
      console.log(user.guestName,"訪客驗證成功並加入房間");
  
      const roomUseId = user.roomUseId;
      socket.join(roomUseId);
      roomPeople.push(user.guestName);
      // console.log("目前使用者Socket.room", socket.rooms);
  
      // pushQuestion(StartRoom,roomUseId);
  
      // StartRoom.to(roomUseId).emit("Question", { roomUseId });
  
      // // console.log("joinedRoom emit 完成");
      // // 設定一個定時推播題目的間隔
      // const intervalId = setInterval(() => {
      //   pushQuestion(StartRoom,roomUseId);
      // }, timeInterval);
  
      socket.on("disconnect", () => {
        roomPeople = roomPeople.filter((name) => name !== user.guestName);
        if(roomPeople.length === 0){
          clearInterval(intervalId);
          console.log("停止推播題目");
        }
        console.log("User disconnected");
      });
    });
  //#endregion
});
//#endregion


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
