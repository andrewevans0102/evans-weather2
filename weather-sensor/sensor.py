import board
import adafruit_dht
import logging
import jwt
import requests
import json
import time

logging.basicConfig(filename='/home/pi/weather-sensor/history_sensor.log',format='%(asctime)s\t%(message)s', datefmt='%m/%d/%Y %I:%M:%S %p', level=logging.INFO)

dhtDevice = adafruit_dht.DHT22(board.D2)

sensor_endpoint  = "https://us-central1-evans-weather-ce3a5.cloudfunctions.net/app/api/sensor"

# create JWT for calls
encoded_jwt = jwt.encode({"<PAYLOAD_NAME>": "<ACTUAL_VALUE>"}, "<SECRET_PASSPHRASE>", algorithm="HS256")
# once the encoded_jwt is created it is a string that needs to be decoded to correctly place in headers
headers={
    "Content-Type": "application/json",
    "authorization": "Bearer " + encoded_jwt.decode("utf-8")
}

try:
	temperature = round(dhtDevice.temperature * (9 / 5) + 32)
	humidity = dhtDevice.humidity
	weather_body = {
		'temp': str(temperature), 
		'humid': str(humidity),
		'status': 'success'
		}
	logging.info('reading successful with temp: ' + str(temperature) + ' and humidity ' + str(humidity))
	sentRequest = requests.post(url = sensor_endpoint, headers = headers, data = json.dumps(weather_body))
	logging.info("sensor was sent with status code of " + str(sentRequest.status_code))
	time.sleep(10)
except RuntimeError as error:
	# Errors happen fairly often, DHT's are hard to read, just keep going
	logging.error('Runtime Error')
	logging.error(error.args[0])
	weather_body = {
		'temp': '',
		'humid': '',
		'status': error.args[0]
	}
	sentRequest = requests.post(url = sensor_endpoint, headers = headers, data = json.dumps(weather_body))
	logging.info("sensor was sent with status code of " + str(sentRequest.status_code))
except Exception as error:
	logging.error('General Exception')
	logging.error(error.args[0])
	weather_body = {
		'temp': '',
		'humid': '',
		'status': error.args[0]
	}
	sentRequest = requests.post(url = sensor_endpoint, headers = headers, data = json.dumps(weather_body))
	logging.info("sensor was sent with status code of " + str(sentRequest.status_code))
