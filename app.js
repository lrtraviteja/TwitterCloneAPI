const express = require("express");
const app = express();
app.use(express.json());

const { open } = require("sqlite");
const sqlite3 = require("sqlite3");

const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DBError: ${error.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//LOGIN MIDDLEWARE FUNCTION
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid jWT Token");
      } else {
        request.payload = payload;
        next();
      }
    });
  }
};

//REGISTER USER API
app.post("/register/", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(request.body.password, 10);
      const createUserQuery = `
      INSERT INTO 
        user (username, name, password, gender) 
      VALUES 
        (
          '${username}', 
          '${name}',
          '${hashedPassword}', 
          '${gender}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      response.status(200);
      response.send(`User created successfully`);
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//LOGIN USER API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}'`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = dbUser;
      const jwtToken = jwt.sign(payload, "secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//USER FEED API
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { user_id, name, username, gender } = request.payload;
  const getFeedQuery = `
        SELECT 
            username,
            tweet,
            date_time AS dateTime
        FROM 
            follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}
        LIMIT 4
            ;`;
  const feedObj = await db.all(getFeedQuery);
  response.send(feedObj);
});

//USER FOLLOWING API
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { user_id } = request.payload;
  const getFollowingQuery = `
         SELECT 
            name
        FROM 
            user INNER JOIN follower ON user.user_id = follower.following_user_id
        WHERE 
            follower.follower_user_id = ${user_id}    
        ;`;
  const getFollowingObj = await db.all(getFollowingQuery);
  response.send(getFollowingObj);
});

//USER FOLLOWERS API
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { user_id } = request.payload;
  const userFollowersQuery = `
        SELECT 
            name
        FROM
            user INNER JOIN follower ON user.user_id = follower.follower_user_id
        WHERE 
            follower.following_user_id = ${user_id}   
    ;`;
  const userFollowersArray = await db.all(userFollowersQuery);
  response.send(userFollowersArray);
});

//USER TWEETS API
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { user_id } = request.payload;
  const getTweetsDetailsQuery = `
            SELECT
               tweet.tweet AS tweet,
                COUNT(DISTINCT(like.like_id)) AS likes,
                COUNT(DISTINCT(reply.reply_id)) AS replies,
                tweet.date_time AS dateTime
            FROM 
                user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
            WHERE 
                user.user_id = ${user_id}
            GROUP BY
                tweet.tweet_id
            ;`;

  const tweetsDetails = await db.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});

//POST TWEET API
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;
  const { user_id } = request.payload;
  const makeTweetQuery = `INSERT INTO tweet(tweet, user_id) VALUES("${tweet}", ${user_id});`;
  await db.run(makeTweetQuery);
  response.send("Created a Tweet");
});

module.exports = app;
