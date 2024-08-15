const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const userSockets = new Map();
const app = express();
app.use(cors());

let QuestionData = {};
let roomPeople = [];

const RoomData = new Map();

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
    console.log("Data from getGuestListApi:", data.data.guestNameList);
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
    console.error("Teacher Token verification failed:",error.message);
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
const pushQuestion = async (namespace, token, roomUseId) => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/RoomRandomQuestion?roomUseId=${roomUseId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const question = response.data;
    console.log("pushQuestion_推播題目", question.data);
    if(question.data == null){
      return null;
    }
    const roomdata = RoomData.get(roomUseId);
    namespace.to(roomUseId).emit("newQuestion", 
      {
        QuestionData:question.data,
        RoomInfo:{
          roomId:roomdata.roomId,
          timeLimit:roomdata.timeLimit
        }
      }
    );
  } catch (error) {
    console.error("Error fetching question:", error);
  }
};
// 取得房間資訊
const verifyRoom = async (token, roomUseId) => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/ByRoomUseId?roomUseId=${roomUseId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = response.data;
    return data.data;
  } catch (error) {
    console.error("Room verification failed:", roomUseId);
    return null;
  }
};

// 老師開啟房間
const TStartRoom = async (token, roomUseId) => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/StartRoom?roomUseId=${roomUseId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = response.data;
    console.log("已開啟房間");
    return data;
  } catch (error) {
    console.error("TStartRoom verification failed:");
    return null;
  }
};
// 老師關閉房間
const TCloseRoom = async (token, roomUseId) => {
  try {
    const response = await axios.get(
      `${API_URL}/Room/CloseRoom?roomUseId=${roomUseId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = response.data;
    console.log("已關閉房間");
    return data;
  } catch (error) {
    console.error("TCloseRoom verification failed:");
    return null;
  }
};

//#region StartRoom
const StartRoom = io.of("/StartRoom");
StartRoom.on("connection", (socket) => {
  let intervalId;
  console.log("A user connected");
  //#region 教師加入房間
  socket.on("TStartRoom", async (res) => {
    const roomUseId = res[1];
    // 初始化房間資料
    let roomData = RoomData.get(roomUseId);
    if(roomData === undefined){
      // 將房間資料存入總房間資料(RoomData)
      RoomData.set(roomUseId,{
        roomUseId:roomUseId,
        token:res[0], 
        roomPeople:[], 
        intervalId:null
      });
      roomData = RoomData.get(roomUseId);
    }
    else{
      roomData.roomPeople = [];
    }
    if (roomData.intervalId) {
      console.log("清除定時器");
      clearInterval(roomData.intervalId); // 清除定時器
      roomData.intervalId = null; // 重置 intervalId 以防止重複清除
    }

    const token = roomData.token;
    
    const user = await verifyTeacherToken(token);
    if (user === null || !user) {
      socket.emit("error", "Invalid token");
      return;
    }
    console.log("Teacher connected:", user.userName);

    // 確認房間資訊
    const roomInfo = await verifyRoom(token, roomUseId);
    if (roomInfo === null || !roomInfo) {
      socket.emit("error", "Invalid room");
      return;
    }
    // 儲存房間資訊
    roomData.timeLimit = roomInfo.timeLimit;
    roomData.roomId = roomInfo.roomId;
    socket.join(roomUseId);

    // 老師開始房間
    const TStartRoomres = await TStartRoom(token, roomUseId);
    if (TStartRoomres == null || TStartRoomres.status_code == 400) {
      console.log("開始房間失敗回傳", TStartRoomres);
      RoomData.delete(roomUseId);
      socket.emit("error", "開始房間失敗");
    } else {
      console.log("開始房間成功回傳", TStartRoomres.status_code);
      
      // 初始化房間人數
      roomPeople = [];
      // roomData.roomPeople = [];

      // 老師開始房間後，通知所有訪客
      JoinRoom.to(roomUseId).emit("StartRoom", { roomUseId });
    }

    socket.on("disconnect", () => {
      TCloseRoom(token, roomUseId);
      if (intervalId) {
        console.log('清除定時器');
        clearInterval(intervalId); // 清除定時器
        intervalId = null; // 重置 intervalId 以防止重複清除
      }
      if (roomData.intervalId) {
        console.log('清除roomData中的定時器');
        clearInterval(roomData.intervalId); // 清除定時器
        roomData.intervalId = null; // 重置 intervalId 以防止重複清除
      }
      // 更新搶答室狀態值些emit事件給前端戳後端API
      console.log("Teacher disconnected");
    });
  });
  //#endregion

  // 等待所有訪客加入後，開始推播題目
  socket.on("joinRoom", async (res) => {
    try {
      console.log("訪客加入帶的資料=>", res);
      const guest = await verifyToken(res[0]);
      if (guest === null || !guest) {
        socket.emit("error", "Invalid token");
        return;
      }
      const roomUseId = res[1];
      // 取得房間資料
      const roomData = RoomData.get(roomUseId);
      // console.log("roomData=>", roomData);
      if (roomData.intervalId) {
        console.log("清除定時器");
        clearInterval(roomData.intervalId); // 清除定時器
        roomData.intervalId = null; // 重置 intervalId 以防止重複清除
      }
  
      // 紀錄人數
      roomData.roomPeople.push(guest.guestName);
      console.log("roomData.roomPeople=>", roomData.roomPeople);
      // StartRoom.to(roomUseId).emit("GuestListResponse", roomData.roomPeople);
      socket.join(roomUseId);
      console.log(guest.guestName, "訪客驗證成功並加入房間");

      // 取得資料庫房間的訪客列表
      const GuestList = await getGuestListApi(roomUseId);
      console.log("GuestList=>", GuestList);

      // 等待所有訪客加入後，開始推播題目
      if (GuestList.length === roomData.roomPeople.length) {
        const roomInfo = await verifyRoom(res[0], roomUseId);
        try {
          console.log("首次推播題目");
          await pushQuestion(StartRoom, res[0], roomUseId);
          console.log("推播題目成功,設定定時推播題目 roomInfo.timeLimit=>", roomInfo.timeLimit);
          // 設定一個定時推播題目的間隔
          roomData.intervalId = setInterval( async () => {
            console.log("推播題目");
            try {
              const result = await pushQuestion(StartRoom, res[0], roomUseId);
              console.log("result=>", result);
              if (result === null) {
                console.log("停止推播題目");
                clearInterval(roomData.intervalId); // 停止計時器
                StartRoom.to(roomUseId).emit("end", true); // 通知房間結束
              }
            } catch (error) {
              console.error("Failed to push question in interval:", error);
              clearInterval(roomData.intervalId); // 停止計時器以防止錯誤持續發生
              StartRoom.to(roomUseId).emit("end", true); // 通知房間結束
            }
          }, roomInfo.timeLimit * 1000); // 确保乘以 1000
        } catch (error) {
          console.error("Failed to push the first question:", error);
        }
      }

      socket.on("disconnect", () => {
        const guest = verifyToken(res[0]);
        if (guest === null || !guest) {
          socket.emit("error", "Invalid token");
          return;
        }
        roomData.roomPeople = roomData.roomPeople.filter((name) => name !== guest.guestName);
        if (roomPeople.length === 0) {
          clearInterval(roomData.intervalId);
          console.log("停止推播題目");
        }
        console.log("User disconnected");
      });
    } catch (error) {
      RoomData.delete(roomUseId);
      socket.emit("error", error);
    }
  });

  //#region 訪客加入房間
  // socket.on("joinRoom", async (res) => {
  //   const user = await verifyToken(res[0]);
  //   if (user === null || !user) {
  //     socket.emit("error", "Invalid token");
  //     return;
  //   }
  //   console.log(user.guestName, "訪客驗證成功並加入房間");

  //   const roomUseId = user.roomUseId;
  //   socket.join(roomUseId);
  //   roomPeople.push(user.guestName);
  //   // console.log("目前使用者Socket.room", socket.rooms);

  //   // pushQuestion(StartRoom,roomUseId);

  //   // StartRoom.to(roomUseId).emit("Question", { roomUseId });

  //   // // console.log("joinedRoom emit 完成");
  //   // // 設定一個定時推播題目的間隔
  //   // const intervalId = setInterval(() => {
  //   //   pushQuestion(StartRoom,roomUseId);
  //   // }, timeInterval);

  //   socket.on("disconnect", () => {
  //     roomPeople = roomPeople.filter((name) => name !== user.guestName);
  //     if (roomPeople.length === 0) {
  //       clearInterval(intervalId);
  //       console.log("停止推播題目");
  //     }
  //     console.log("User disconnected");
  //   });
  // });
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
