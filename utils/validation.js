const moment = require("moment");
const validator = require("validator");
const  PASSWORD_REGEX  =/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])[A-Za-z\d@$!%*?&.]{8,}$/;

// Get today's date
const today = moment();

const isValidEmail = email => validator.isEmail(email);

const isValidPhone = (phone) => validator.isMobilePhone(phone, "en-IN");

const isValidPassword = (password) => PASSWORD_REGEX.test(password)
const isValidLength = (name) => {
    // Regex explanation:
    // ^[A-Za-z]   : Start with a letter
    // [A-Za-z]*   : Followed by zero or more letters
    // $           : End of string
    // Length check: Between 4 and 40 characters
    const nameRegex = /^[A-Za-z](?:\s?[A-Za-z]+)*[A-Za-z]$/;
    return nameRegex.test(name);
  };

// const isValidLength = name => name.length >= 4 && name.length<=40 && !/^\d/.test(name)

// const isDateGreterThanToday = date => moment(date).isSameOrAfter(today, "day");

// const isValidStartTime = startTime => moment(startTime).isSameOrAfter(today);

// const isValidEndTime = (startTime, endTime) => moment(endTime).isAfter(startTime);

module.exports = {
  isValidEmail,
  isValidPhone,
//   isDateGreterThanToday,
//   isValidStartTime,
//   isValidEndTime,
  isValidPassword,
  isValidLength
};