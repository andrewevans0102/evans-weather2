import os
import logging

logging.basicConfig(filename='/home/pi/weather-sensor/history_sensor.log',format='%(asctime)s\t%(message)s', datefmt='%m/%d/%Y %I:%M:%S %p', level=logging.INFO)

sensor_logs = "/home/pi/weather-sensor/history_sensor.log"

try:
    os.remove(sensor_logs)
    logging.info('sensor logs were deleted successfully')
except Exception as error:
    logging.error('unable to delete logs')
    logging.info(error.args[0])
