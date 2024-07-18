const moment = require("moment");
const validator = require("validator");
const  PASSWORD_REGEX  =/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,:;<>^()[\]{}+_=|/~`#\s\\-])[A-Za-z\d@$!%*?&.,:;<>^()[\]{}+_=|/~`#\s\\-]{8,}$/;

// Get today's date
const today = moment();

const isValidEmail = email => validator.isEmail(email);

const isValidPhone = (phone) => validator.isMobilePhone(phone, "en-IN");

const isValidPassword = (password) => PASSWORD_REGEX.test(password)
const isValidLength = (name) => {
  const nameRegex = /^(?=.{4,40}$)[A-Za-z](?:\s?[A-Za-z]+)*[A-Za-z]$/;
  if (!name) {
    return "Name is required";
  }
  if (/^\s/.test(name)) {
    return "Name should not start with a space";
  }
  if (name.length < 4 || name.length > 40) {
    return "Name should be between 4 and 40 characters long";
  }
  if (/^[0-9]/.test(name)) {
    return "Name should not start with a number";
  }
  if (/\d/.test(name)) {
    return "Name should not contain numbers";
  }
  if (!nameRegex.test(name)) {
    return "Name contains invalid characters";
  }
  return null;  // No errors
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