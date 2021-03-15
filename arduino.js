const express = require("express"),
    app = express(),
    cors = require("cors"),
    moment = require('moment'),
    request = require("request"),
    bodyParser = require('body-parser'),
    fs = require("fs"),
    cyrillicToTranslit = require("cyrillic-to-translit-js");

let settings = require("./settings.json");

app.use(cors());
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());
app.set('view engine', 'hbs');

const capitalize = (s) => {
    if (typeof s !== 'string') return ''
    return s.charAt(0).toUpperCase() + s.slice(1)
}

app.get("/", function (req, res) {
    settings = JSON.parse(fs.readFileSync("./settings.json"));
    res.render(
        "index.hbs",
        {
            city: settings.weather.city,
            weather_settings: {
                checked: settings.weather.enabled ? 'checked' : '',
                disabled: settings.weather.enabled ? '' : 'disabled'
            },
            corona: settings.corona ? 'checked' : '',
            course: settings.course ? 'checked' : '',
            h24: settings.h24 ? 'checked' : ''
        }
    );
});

let courseObj = {}, weather = {}, corona = 0;

function updateInfo() {
    request.get("https://www.cbr-xml-daily.ru/daily_json.js", function (e, r, b) {
        try {
            let buffcour = JSON.parse(b).Valute;
            courseObj.KZT = buffcour.KZT.Value / buffcour.KZT.Nominal;
            courseObj.USD = buffcour.USD.Value;
            courseObj.EUR = buffcour.EUR.Value;
        } catch (e) { }
    });
    request.get(`http://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(settings.weather.city)}&lang=ru&units=metric&appid=5d8820e4be0b3f1818880ef51406c9ee`, function (e, r, b) {
        try {
            let data = JSON.parse(b);
            weather = {
                weather: cyrillicToTranslit().transform(capitalize(data.weather[0].description)),
                temp: {
                    temp: data.main.temp,
                    humidity: data.main.humidity
                },
                sun: {
                    rise: moment.utc(data.sys.sunrise * 1000).utcOffset(data.timezone / 60).format("HH:ss"),
                    set: moment.utc(data.sys.sunset * 1000).utcOffset(data.timezone / 60).format("HH:ss")
                }
            };
        } catch (e) { }
    });
    request.get(`https://api.covid19api.com/dayone/country/Kazakhstan`, function (e, r, b) {
        try {
            let data = JSON.parse(b);
            corona = data[data.length - 1]["Confirmed"] + "";
        } catch (e) { }
    });
};

updateInfo();

setInterval(updateInfo, 10000);

function getTime() {
    return {
        0: moment().add(3, 'hours').format(settings.h24 ? "     HH:mm" : "    hh:mm A    "),
        1: moment().add(3, 'hours').format(" ddd DD.MM.YYYY"),
        2: 16
    }
}

app.get("/api/info", function (req, res) {
    if (new Date().getMinutes() % 5 == 0) {
        try {
            let activeInfos = [];
            if (settings.weather.enabled) activeInfos.push("weather");
            if (settings.corona) activeInfos.push("corona");
            if (settings.course) activeInfos.push("course");

            if (activeInfos.length == 0) return res.json(getTime());

            let element = activeInfos[Math.floor(Math.random() * activeInfos.length)];

            if (element == "weather") {
                let f = `${weather.weather.toUpperCase()} | TEMP: ${weather.temp.temp}C | VLAGA: ${weather.temp.humidity}%`,
                    s = `SUNRISE: ${weather.sun["rise"]} | SUNSET: ${weather.sun["set"]}`;

                let max = f.length;
                if (s.length > max) max = s.length;

                res.json({
                    0: f,
                    1: s,
                    2: max
                })
            } else if (element == "corona") {
                res.json({
                    0: `Coronavirus stat:`,
                    1: `${corona} people`,
                    2: 16
                });
            } else if (element == "course") {
                let s = `EUR: ${(courseObj.EUR / courseObj.KZT).toFixed(2)} RUB: ${(1 / courseObj.KZT).toFixed(2)}`;
                res.json({
                    0: s,
                    1: `     USD ${(courseObj.USD / courseObj.KZT).toFixed(2)}`,
                    2: s.length
                });
            }
        } catch (err) {
            res.json({
                0: `SERVER ERROR`,
                1: ``
            });
            console.log(err);
        }
    } else {
        res.json(getTime());
    }
});

app.get("/api/time", function (req, res) {
    res.json(getTime());
});

app.post("/api/save", function (req, res) {
    let body = req.body;
    res.end();
    settings = {
        weather: {
            city: body["weather[city]"],
            enabled: (body["weather[on]"] == 'true'),
        },
        corona: (body.corona == 'true'),
        course: (body.course == 'true'),
        h24: (body.h24 == 'true')
    }
    fs.writeFileSync("./settings.json", JSON.stringify(settings, null, '\t'))
});

app.use(express.static(__dirname + '/files'));

app.listen(1337, () => {
    console.log("Project started");
});