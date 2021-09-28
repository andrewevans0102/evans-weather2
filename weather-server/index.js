const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
require("dotenv").config();
const cors = require("cors");
const app = express();
app.use(cors({ origin: true }));
const axios = require("axios");
const moment = require("moment");
const jwt = require("jsonwebtoken");

// setup the API to have admin privlages
// this uses the builtin FIREBASE_CONFIG environment variables and a JSON file pulled from the console
// https://firebase.google.com/docs/functions/config-env
// https://firebase.google.com/docs/admin/setup#initialize-sdk
const serviceAccount = require("./service-account/permissions.json");
const adminConfig = JSON.parse(process.env.FIREBASE_CONFIG);
adminConfig.credential = admin.credential.cert(serviceAccount);
admin.initializeApp(adminConfig);

// create reference to the database for firestore here
const db = admin.firestore();

/**
 * middleware to log requests
 * @param  {[type]}   req  request
 * @param  {[type]}   res  response
 * @param  {Function} next callback
 * @return {[type]}
 */
const requestTime = function (req, res, next) {
  req.requestTime = Date.now();
  console.log("method " + req.method + " and url " + req.url);
  console.log("headers " + JSON.stringify(req.headers));
  console.log("body" + JSON.stringify(req.body));
  console.log("request came across at " + req.requestTime);
  next();
};
app.use(requestTime);

// secure API calls
const validateToken = async (req, res, next) => {
  if (req.headers.authorization === undefined) {
    console.log("authorization header was not defined");
    return res.status(403).send("Unauthorized");
  }

  try {
    // verify the JWT for the request
    const authorization = req.headers.authorization.split("Bearer ")[1].trim();
    console.log(authorization);
    const decodedPayload = jwt.verify(authorization, process.env.SENSOR_KEY);
    if (decodedPayload.source !== process.env.SENSOR_SOURCE) {
      console.log("authorization header was not valid");
      throw new Error("Unauthorized");
    }
    console.log("authorization header was good");
    next();
    return;
  } catch (error) {
    console.log(error);
    return res.status(403).send("Unauthorized");
  }
};
app.use(validateToken);

const callNOAA = async () => {
  let NOAAResponse = {};
  try {
    const forecastResponse = await axios.get(process.env.FORECAST_DETAILED);
    const detailedForecast = forecastResponse.data.properties.periods;

    const hourlyResponse = await axios.get(process.env.FORECAST_HOURLY);
    let hourlyForecast = {};
    hourlyForecast = hourlyResponse.data.properties.periods.filter((value) => {
      if (value.number <= 12) {
        return true;
      } else {
        return false;
      }
    });

    NOAAResponse = {
      detailed: detailedForecast,
      hourly: hourlyForecast,
      status: "success",
    };
  } catch (error) {
    console.log(error);
    NOAAResponse = {
      detailed: {},
      hourly: {},
      status: JSON.stringify(error),
    };
  }
  return NOAAResponse;
};

const callOpenWeatherMapAPI = async () => {
  let response = {};
  try {
    const weatherCall = `https://api.openweathermap.org/data/2.5/weather?lat=${process.env.LATITUDE}&lon=${process.env.LONGITUDE}&units=imperial&appid=${process.env.OPEN_WEATHER_MAP_API_KEY}`;
    const weatherResponse = await axios.get(weatherCall);

    const windDegree = weatherResponse.data.wind.deg;
    let windDirection = "N";
    if (windDegree === 0 || windDegree === 360) {
      windDirection = "N";
    } else if (windDegree === 90) {
      windDirection = "E";
    } else if (windDegree === 180) {
      windDirection = "S";
    } else if (windDegree === 270) {
      windDirection = "W";
    } else if ((windDegree > 0) & (windDegree < 90)) {
      windDirection = "NE";
    } else if (windDegree > 90 && windDegree < 180) {
      windDirection = "SE";
    } else if (windDegree > 180 && windDegree < 270) {
      windDirection = "SW";
    } else if (windDegree > 270 && windDegree < 360) {
      windDirection = "NW";
    }

    // https://www.convertunits.com/from/hPa/to/inch+of+mercury
    // a reading of 30 is considered normal
    // https://weather.com/sports-recreation/fishing/news/fishing-barometer-20120328
    const pressureInch =
      0.02953 * parseFloat(weatherResponse.data.main.pressure);

    response = {
      pressure: pressureInch,
      windSpeed: weatherResponse.data.wind.speed,
      windDirection: windDirection,
      status: "success",
    };
  } catch (error) {
    console.log(error);
    response = {
      pressure: "",
      windSpeed: "",
      windDirection: "",
      status: JSON.stringify(error),
    };
  }

  return response;
};

app.post("/api/sensor", async (req, res) => {
  (async () => {
    const recorded = moment().utcOffset(process.env.MOMENT_OFFSET);
    try {
      let tempRounded = 0;
      let humidity = "";
      // if not successful response from sensor then take what
      // was already in the DB
      if (req.body.status !== "success") {
        console.log("making weather query");
        let weatherQuery = db.collection("weather").doc("/0");
        const weatherResponse = await weatherQuery.get();
        console.log("weather query finished");
        console.log(JSON.stringify(weatherResponse));
        tempRounded = weatherResponse.data().temp;
        humidity = weatherResponse.data().humid;
      } else {
        const weatherTemp = parseFloat(req.body.temp);
        tempRounded = Math.round(weatherTemp);
        humidity = req.body.humid;
      }

      console.log("calling NOAA");
      const NOAAResponse = await callNOAA();
      console.log("call to NOAA was successful");
      console.log("calling OpenWeatherMapAPI");
      const openWeatherMapAPIResponse = await callOpenWeatherMapAPI();
      console.log("call to OpenWeatherMapAPI successful");

      const weather = {
        recorded: recorded.format("MMMM Do YYYY, h:mm:ss a"),
        temp: tempRounded,
        humid: humidity,
        detailed: NOAAResponse.detailed,
        hourly: NOAAResponse.hourly,
        pressure: openWeatherMapAPIResponse.pressure,
        windSpeed: openWeatherMapAPIResponse.windSpeed,
        windDirection: openWeatherMapAPIResponse.windDirection,
        sensorStatus: req.body.status,
        NOAAStatus: NOAAResponse.status,
        openWeatherMapAPIStatus: openWeatherMapAPIResponse.status,
      };

      console.log("writing value");
      await db.collection("weather").doc("/0/").set(weather);
      console.log("write of value was successful");
      return res.status(200).send();
    } catch (error) {
      console.log(error);
      return res.status(500).send(error);
    }
  })();
});

app.get("/api/weather", async (req, res) => {
  (async () => {
    try {
      let weatherQuery = db.collection("weather").doc("/0");
      const weatherResponse = await weatherQuery.get();

      const weather = {
        sensorRecorded: weatherResponse.data().recorded,
        temp: weatherResponse.data().temp,
        humid: weatherResponse.data().humid,
        pressure: weatherResponse.data().pressure,
        windSpeed: weatherResponse.data().windSpeed,
        windDirection: weatherResponse.data().windDirection,
        hourly: weatherResponse.data().hourly,
        detailed: weatherResponse.data().detailed,
        sensorStatus: weatherResponse.data().sensorStatus,
        NOAAStatus: weatherResponse.data().NOAAStatus,
        OpenWeatherMapAPIStatus: weatherResponse.data().openWeatherMapAPIStatus,
      };
      return res.status(200).send(weather);
    } catch (error) {
      console.log(error);
      return res.status(500).send(error);
    }
  })();
});

exports.app = functions.https.onRequest(app);
