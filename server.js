const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());

const RoomData = new Map();

const server = http.createServer(app);
//#region socket.io設定(cros)
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ["GET", "POST"],
  },
});
//#endregion

app.get("/", (req, res) => {
  res.send("Server is running");
});

const PORT = process.env.APP_PORT || 3001;
const API_URL = process.env.API_URL || "https://brainboost.backend.newfields.com.tw/BrainBoost";

//#region 取得訪客列表
const getGuestListApiandEmit = async (roomUseId) => {
  
  // 從房間資料取得等待人員名單
  const roomData = RoomData.get(roomUseId);
  if(roomData === undefined){
    return;
  }
  const data = { data: { guestNameList: roomData.waitPeople } };
  
  JoinRoom.to(roomUseId).emit("GuestListResponse", data.data.guestNameList);
  
  console.log(`Data from RoomUseId:${roomUseId} RoomData:`, roomData);
  
  // try {
  //   // console.log("=========進入取得訪客列表Function=========");
  //   // const response = await axios.get(
  //   //   `${API_URL}/Guest/GuestList?roomUseId=${roomUseId}`
  //   // );
  //   // const data = response.data;
  //   // console.log("Data from getGuestListApi:", data.data.guestNameList);

  //   // 廣播給所有房間中的用戶
  //   JoinRoom.to(roomUseId).emit("GuestListResponse", data.data.guestNameList);
  //   // console.log("=========function執行完成=========");
  // } catch (error) {
  //   console.error(
  //     `Error fetching data from ${API_URL}/Guest/GuestList?roomUseId=${roomUseId}:`,
  //     error
  //   );
  // }
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
    // console.log(`${API_URL + "/User/MySelf"} Teacher Token=>`, token);
    const response = await axios.get(`${API_URL}/User/MySelf`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = response.data;
    // console.log("老師資訊", data.data.userName);
    return data.data;
  } catch (error) {
    console.error(`[${getTimeStamp()}]Teacher Token verification failed:${error.message}`);
    return null;
  }
};
//#endregion

//#region 等待室
const JoinRoom = io.of("/JoinRoom");
JoinRoom.on("connection", (socket) => {

  //#region 教師加入房間
  socket.on("TjoinRoom", async (res) => {
    // console.log("Teacher Info=>", res);
    const token = res[0];
    
    // 根據roomUseId初始化房間資料
    const roomUseId = res[1];
    let roomData = RoomData.get(roomUseId);
    if(roomData === undefined){
      // 將房間資料存入總房間資料(RoomData)
      RoomData.set(roomUseId, {
        roomUseId: roomUseId,
        token: res[0],
        waitPeople: [],
        roomPeople: [],
        intervalId: null,
      });
      roomData = RoomData.get(roomUseId);
    }
    else{
      roomData.roomUseId = roomUseId;
      roomData.token = token;
      roomData.waitPeople = [];
      roomData.roomPeople = [];
      roomData.intervalId = null;
    }
    if (roomData.intervalId) {
      console.log("清除定時器");
      clearInterval(roomData.intervalId); // 清除定時器
      roomData.intervalId = null; // 重置 intervalId 以防止重複清除
    }

    const user = await verifyTeacherToken(token);
    if (user === null || !user) {
      socket.emit("error", "Invalid token");
      return;
    }
    console.log("Teacher connected:", user.userName);

    socket.join(roomUseId);

    getGuestListApiandEmit(roomUseId);

    socket.on("disconnect", () => {
      // 刪除房間資料
      RoomData.delete(roomUseId);
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
    console.log(`[${getTimeStamp()}]${user.guestName} connected /JoinRoom/joinRoom`);

    const roomUseId = user.roomUseId;
    socket.join(roomUseId);
    // console.log("目前使用者Socket.room", socket.rooms);

    // 將訪客資料放入房間等待人員名單
    const roomData = RoomData.get(roomUseId);
    // 判斷是否有房間資料，若無則emit錯誤
    if(roomData === undefined){
      console.log(`[${getTimeStamp()}]房間未開啟 RoomUseId:${roomUseId}`);
      socket.emit("error", "房間未開啟");
      return;
    }
    // 紀錄人數
    roomData.roomPeople.push(guest.guestName);
    roomData.waitPeople.push(user.guestName);

    await getGuestListApiandEmit(roomUseId);

    JoinRoom.to(roomUseId).emit("joinedRoom", { roomUseId });

    socket.on("disconnect", async () => {
      // 將使用者從房間等待人員名單中移除
      roomData.waitPeople = roomData.waitPeople.filter((name) => name !== user.guestName);
      // 推播等待人員名單
      await getGuestListApiandEmit(roomUseId);
      console.log(`[${getTimeStamp()}]${user.guestName} disconnected`);
    });
  });
  //#endregion
});
//#endregion

//#region 開始搶答後的socket

  //#region Function
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
      // console.log("pushQuestion_推播題目", question.data);
      if(question.data == null){
        return null;
      }
      const roomdata = RoomData.get(roomUseId);
      namespace.to(roomUseId).emit("newQuestion", 
        {
          QuestionData:question.data,
          RoomInfo:{
            roomName:roomdata.roomName,
            roomId:roomdata.roomId,
            timeLimit:roomdata.timeLimit
          }
        }
      );
    } catch (error) {
      console.error(`[${getTimeStamp()}]Error fetching question:${error}`, );
    }
  };

  // 推撥分數
  const pushScore = async (namespace, token, roomUseId) => {
    try {
      const response = await axios.get(
        `${API_URL}/Room/ScoreBoard?roomUseId=${roomUseId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const score = response.data;
      // console.log("ScoreBoard_推播分數", score.data);
      namespace.to(roomUseId).emit("Score", score.data);
    }
    catch(error){
      console.error(`[${getTimeStamp()}]Error fetching score:${error}`);
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
      console.error(`[${getTimeStamp()}]Room verification failed:${roomUseId}`, );
      return null;
    }
  };

  // 老師開啟房間
  const TStartRoom = async (token, roomUseId) => {
    try {
      // console.log("token:",token,"roomUseId:", roomUseId);
      const response = await axios.get(
        `${API_URL}/Room/StartRoom?roomUseId=${roomUseId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = response.data;
      // 成功開啟房間加上時間戳記
      console.log(`[${getTimeStamp()}]Room Start Success:${data}`);
      return data;
    } catch (error) {
      console.error(`[${getTimeStamp()}]TStartRoom verification failed:${error.response.data}`);
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
      console.error(`[${getTimeStamp()}]TCloseRoom verification failed:${error.response.data}`);
      return null;
    }
  };
  
  // 取得當前時間
  const getTimeStamp = () => {
    const now = new Date();
    return now.toISOString(); // ISO格式時間
  };
  //#endregion

  //#region 正式搶答房間
  const StartRoom = io.of("/StartRoom");
  StartRoom.on("connection", (socket) => {
    let intervalId;
    let token;
    //#region 教師加入房間
    socket.on("TStartRoom", async (res) => {
      
      // 根據roomUseId初始化房間資料
      const roomUseId = res[1];
      let roomData = RoomData.get(roomUseId);
      if(roomData === undefined){
        // 將房間資料存入總房間資料(RoomData)
        RoomData.set(roomUseId, {
          roomUseId: roomUseId,
          token: res[0],
          waitPeople: [],
          roomPeople: [],
          intervalId: null,
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
      token = roomData.token;
      
      // 驗證老師Token
      const user = await verifyTeacherToken(token);
      if (user === null || !user) {
        socket.emit("error", "Invalid token");
        return;
      }
      // 加上時間戳記
      console.log(`[${getTimeStamp()}]Teacher StartRoom:`, user.userName);

      // 確認房間資訊
      const roomInfo = await verifyRoom(token, roomUseId);
      if (roomInfo === null || !roomInfo) {
        socket.emit("error", "Invalid room");
        return;
      }
      // 儲存房間資訊
      roomData.roomName = roomInfo.roomName;
      roomData.timeLimit = roomInfo.timeLimit;
      roomData.roomId = roomInfo.roomId;
      socket.join(roomUseId);
      JoinRoom.to(roomUseId).emit("StartRoom", { roomUseId });
    

      socket.on("disconnect", () => {
        TCloseRoom(token, roomUseId);
        if (intervalId) {
          // console.log('清除定時器');
          clearInterval(intervalId); // 清除定時器
          intervalId = null; // 重置 intervalId 以防止重複清除
        }
        if (roomData.intervalId) {
          // console.log('清除roomData中的定時器');
          clearInterval(roomData.intervalId); // 清除定時器
          roomData.intervalId = null; // 重置 intervalId 以防止重複清除
        }
        // 加上時間戳記
        console.log(`[${getTimeStamp()}]Teacher disconnected:`, user.userName);

      });
    });
    // #endregion
    // #region 訪客加入房間
    // 等待所有訪客加入後，開始推播題目
    socket.on("joinRoom", async (res) => {
      try {
        // 訪客加入帶的資料加上時間戳記
        const guest = await verifyToken(res[0]);
        if (guest === null || !guest) {
          socket.emit("error", "Invalid token");
          return;
        }
        console.log(`[${getTimeStamp()}]Guest connected:`, guest.guestName);
        const roomUseId = res[1];
        // 取得房間資料
        const roomData = RoomData.get(roomUseId);
        // console.log("roomData=>", roomData);
        if (roomData.intervalId) {
          console.log("清除定時器");
          clearInterval(roomData.intervalId); // 清除定時器
          roomData.intervalId = null; // 重置 intervalId 以防止重複清除
        }
    
        // console.log("roomData.roomPeople=>", roomData.roomPeople);
        // StartRoom.to(roomUseId).emit("GuestListResponse", roomData.roomPeople);
        socket.join(roomUseId);
        // console.log(guest.guestName, "訪客驗證成功並加入房間");

        // 取得資料庫房間的訪客列表
        const GuestList = await getGuestListApi(roomUseId);
        console.log("GuestList=>", GuestList);

        //#region 等待所有訪客加入後，開始推播題目
        if (GuestList.length === roomData.roomPeople.length) {

          // console.log("所有訪客已加入");
          // 等待所有訪客加入後，開始推播題目
          const TStartRoomres = await TStartRoom(roomData.token, roomUseId);
          if (TStartRoomres == null || TStartRoomres.status_code == 400) {
            // console.log("開始房間失敗回傳", TStartRoomres);
            RoomData.delete(roomUseId);
            socket.emit("error", "開始房間失敗");
          } 
          // else {
          //   console.log("開始房間成功回傳", TStartRoomres.status_code);
            
            // 初始化房間人數
            // roomPeople = [];
            // roomData.roomPeople = [];

            // 老師開始房間後，通知所有訪客
            // JoinRoom.to(roomUseId).emit("StartRoom", { roomUseId });
          // }

          // const roomInfo = await verifyRoom(res[0], roomUseId);
          try {
            // console.log("首次推播題目");
            setTimeout(async()=>{await pushQuestion(StartRoom, res[0], roomUseId);},5000);

            // console.log("推播題目成功,設定定時推播題目 roomInfo.timeLimit=>", roomData.timeLimit);
            // 設定一個定時推播題目的間隔
            roomData.intervalId = setInterval( async () => {
              // console.log("推播題目");
              try {

                // 先推撥目前搶答是分數排名
                await pushScore(StartRoom, roomData.token, roomUseId);

                // 再推撥題目
                setTimeout(async () => {
                  const result = await pushQuestion(StartRoom, res[0], roomUseId);
                  // console.log("result=>", result);
  
                  if (result === null) {
                    // console.log("停止推播題目");
                    clearInterval(roomData.intervalId); // 停止計時器
                    StartRoom.to(roomUseId).emit("end", true); // 通知房間結束
                    RoomData.delete(roomUseId);
                  }
                }, 5000);

              } catch (error) {
                // console.error("Failed to push question in interval:", error);
                clearInterval(roomData.intervalId); // 停止計時器以防止錯誤持續發生
                StartRoom.to(roomUseId).emit("end", true); // 通知房間結束
                RoomData.delete(roomUseId);
              }
            }, ( roomData.timeLimit + 5 ) * 1000); // 确保乘以 1000
          } catch (error) {
            clearInterval(roomData.intervalId); // 停止計時器以防止錯誤持續發生
            // console.error("Failed to push the first question:", error);
          }
        }
        //#endregion
        socket.on("disconnect", () => {
          const guest = verifyToken(res[0]);
          if (guest === null || !guest) {
            socket.emit("error", "Invalid token");
            return;
          }
          roomData.roomPeople = roomData.roomPeople.filter((name) => name !== guest.guestName);
          if (roomData.roomPeople.length === 0) {
            clearInterval(roomData.intervalId);
            console.log("停止推播題目");
          }
          console.log("User disconnected");
        });
      } catch (error) {
        socket.emit("error", error);
      }
    });
  });
  //#endregion

//#endregion

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
