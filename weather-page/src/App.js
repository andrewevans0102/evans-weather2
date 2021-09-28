import React, { useState, useEffect } from 'react';
import './App.scss';
import { Subject, interval } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';
import axios from 'axios';
import { Line } from 'react-chartjs-2';
import moment from 'moment';
import { DateTime } from 'luxon';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faWind,
    faTachometerAlt,
    faThermometerFull,
    faFan,
    faSync,
} from '@fortawesome/free-solid-svg-icons';

function App() {
    const [temp, setTemp] = useState('0');
    const [humidity, setHumidity] = useState('0');
    const [sensorStatus, setSensorStatus] = useState('');
    const [NOAAStatus, setNOAAStatus] = useState('');
    const [OpenWeatherMapAPIStatus, setOpenWeatherMapAPIStatus] = useState('');
    const [hourlyTemps, setHourlyTemps] = useState([]);
    const [hours, setHours] = useState([]);
    const [detailed, setDetailed] = useState([]);
    const [barometricPressure, setBarometricPressure] = useState('');
    const [windSpeed, setWindSpeed] = useState('');
    const [windDirection, setWindDirection] = useState('');
    const [showProcessing, setShowProcessing] = useState(false);

    // 5 minutes
    const intervalSeconds = 10000 * 6 * 5;
    // here is the function endpoint that is called to retrieve the weather information
    const resultsEndpoint = '<FIREBASE_FUNCTION>';
    const authToken = '<ACTUAL_VALUE>';

    const data = {
        labels: hours,
        datasets: [
            {
                label: 'Hourly Temps',
                borderColor: 'blue',
                data: hourlyTemps,
            },
        ],
    };

    const options = {
        title: {
            display: true,
        },
        scales: {
            yAxes: [
                {
                    ticks: {
                        suggestedMin: 0,
                        suggestedMax: 100,
                        padding: 1,
                    },
                },
            ],
        },
    };

    const callWeather = async () => {
        try {
            const headers = {
                'Content-Type': 'application/json',
                authorization: `Bearer ${authToken}`,
            };

            const response = await axios.get(resultsEndpoint, {
                headers: headers,
            });

            setTemp(response.data.temp);
            setHumidity(response.data.humid);
            setSensorStatus(response.data.sensorStatus);
            setNOAAStatus(response.data.NOAAStatus);
            setOpenWeatherMapAPIStatus(response.data.OpenWeatherMapAPIStatus);

            const dateToday = DateTime.local();
            const dateTomorrow = DateTime.local().plus({ days: 2 });

            const todayDetailed = response.data.detailed.filter((value) => {
                const endTime = DateTime.fromISO(value.endTime);

                if (endTime >= dateToday && endTime <= dateTomorrow) {
                    return true;
                } else {
                    return false;
                }
            });
            setDetailed(todayDetailed);

            const temps = [];
            const tempsHours = [];
            response.data.hourly.forEach((value) => {
                temps.push(value.temperature);
                const startTime = moment(value.startTime);
                tempsHours.push(startTime.format('h a'));
            });
            setHourlyTemps(temps);
            setHours(tempsHours);
            setWindSpeed(response.data.windSpeed);
            setWindDirection(response.data.windDirection);
            setBarometricPressure(response.data.pressure);
        } catch (error) {
            throw error;
        }
    };

    useEffect(() => {
        async function retrieveWeather() {
            // call weather one time when first loads
            setShowProcessing(true);
            try {
                await callWeather();
            } catch (error) {
                console.log(error);
            }
            setTimeout(() => {
                setShowProcessing(false);
            }, 2000);

            // call weather every 5 minutes after it loads
            const weatherTimer = interval(intervalSeconds);
            const unsubscribe$ = new Subject();
            const weatherObservable = weatherTimer.pipe(
                takeUntil(unsubscribe$),
                catchError((error) => {
                    throw error;
                })
            );
            unsubscribe$.subscribe();
            weatherObservable.subscribe(async () => {
                setShowProcessing(true);
                try {
                    await callWeather();
                } catch (error) {
                    console.log(error);
                }
                setTimeout(() => {
                    setShowProcessing(false);
                }, 2000);
            });
            return () => {
                unsubscribe$.next();
                unsubscribe$.complete();
            };
        }
        retrieveWeather();
    }, []);

    return (
        <main>
            {showProcessing === true ? (
                <article className="weather__spinner">
                    <h1>Updating...</h1>
                    <FontAwesomeIcon icon={faSync} spin size="6x" />
                </article>
            ) : (
                <section className="weather">
                    <h1 className="weather__title">Evans Weather</h1>
                    <div className="weather__output">
                        <div className="weather__output--results">
                            <div className="weather__output--results-group">
                                <span className="weather__temp">
                                    Temp: {temp}&#176; &nbsp;
                                    <FontAwesomeIcon icon={faThermometerFull} />
                                </span>
                                <span className="weather__humidity">
                                    Humidity: {humidity}% &nbsp;
                                    <FontAwesomeIcon icon={faFan} />
                                </span>
                            </div>
                            <div className="weather__output--results-group">
                                <div className="weather__wind">
                                    <p>
                                        Wind &nbsp;
                                        {Math.round(
                                            parseFloat(windSpeed)
                                        )} mph {windDirection} &nbsp;
                                        <FontAwesomeIcon icon={faWind} />
                                    </p>
                                </div>
                                <span className="weather__barometer">
                                    <p>
                                        Pressure &nbsp;
                                        {barometricPressure !== '' &&
                                        parseFloat(barometricPressure) > 30 ? (
                                            <span className="weather__barometer--high">
                                                {parseFloat(
                                                    barometricPressure
                                                ).toFixed(2)}{' '}
                                                H
                                            </span>
                                        ) : (
                                            <span className="weather__barometer--low">
                                                {parseFloat(
                                                    barometricPressure
                                                ).toFixed(2)}{' '}
                                                L
                                            </span>
                                        )}
                                        &nbsp;
                                        <FontAwesomeIcon
                                            icon={faTachometerAlt}
                                        />
                                    </p>
                                </span>
                            </div>
                            <div className="weather__noaa">
                                {detailed &&
                                    detailed.map((value) => (
                                        <div
                                            className="weather__noaa--entry"
                                            key={value.name}
                                        >
                                            <p className="weather__noaa--entry-name">
                                                {value.name}
                                            </p>
                                            <p>{value.detailedForecast}</p>
                                        </div>
                                    ))}
                            </div>
                        </div>
                        <div className="weather__chart">
                            <div className="weather__time">
                                {sensorStatus && sensorStatus === 'success' && (
                                    <span className="weather__status--success">
                                        Sensor Status: {sensorStatus}
                                    </span>
                                )}
                                {sensorStatus && sensorStatus !== 'success' && (
                                    <span className="weather__status--error">
                                        Sensor Status: {sensorStatus}
                                    </span>
                                )}
                                {NOAAStatus && NOAAStatus === 'success' && (
                                    <span className="weather__status--success">
                                        NOAA Status: {NOAAStatus}
                                    </span>
                                )}
                                {NOAAStatus && NOAAStatus !== 'success' && (
                                    <span className="weather__status--error">
                                        NOAA Status: {NOAAStatus}
                                    </span>
                                )}

                                {OpenWeatherMapAPIStatus &&
                                    OpenWeatherMapAPIStatus === 'success' && (
                                        <span className="weather__status--success">
                                            OpenWeatherMapAPI Status:{' '}
                                            {OpenWeatherMapAPIStatus}
                                        </span>
                                    )}
                                {OpenWeatherMapAPIStatus &&
                                    OpenWeatherMapAPIStatus !== 'success' && (
                                        <span className="weather__status--error">
                                            OpenWeatherMapAPI Status:{' '}
                                            {OpenWeatherMapAPIStatus}
                                        </span>
                                    )}
                            </div>
                            <Line data={data} options={options} />
                        </div>
                    </div>
                </section>
            )}
        </main>
    );
}

export default App;
