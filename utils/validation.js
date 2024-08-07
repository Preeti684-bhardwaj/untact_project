const moment = require("moment");
const validator = require("validator");
// const  PASSWORD_REGEX  =/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.,:;<>^()[\]{}+_=|/~`#\s\\-])[A-Za-z\d@$!%*?&.,:;<>^()[\]{}+_=|/~`#\s\\-]{8,}$/;

// Get today's date
const today = moment();

const isValidEmail = email => validator.isEmail(email);

// const isValidPhone = (phone) => validator.isMobilePhone(phone, "en-IN");

const isValidPassword = (password) => {
  if (password.length < 8) {
    return "Password must be at least 8 characters long";
  }

  if (!/(?=.*[a-z])/.test(password)) {
    return "Password must contain at least one lowercase letter";
  }

  if (!/(?=.*[A-Z])/.test(password)) {
    return "Password must contain at least one uppercase letter";
  }

  if (!/(?=.*\d)/.test(password)) {
    return "Password must contain at least one number";
  }

  if (!/(?=.*[@$!%*?&.,:;<>^()[\]{}+_=|/~`#\\-])/.test(password)) {
    return "Password must contain at least one special character";
  }

  if (/\s/.test(password)) {
    return "Password must not contain any spaces";
  }

  // If all checks pass, the password is valid
  return null;
};
const isValidLength = (name) => {
  // const nameRegex = /^(?=.{4,40}$)[A-Za-z](?:\s?[A-Za-z]+)*[A-Za-z]$/;
  if (!name) {
    return "Name is required";
  }
  if (/^\s|\s$/.test(name)) {
    return "Name should not start or end with a space";
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
  if (/[^a-zA-Z\s]/.test(name)) {
    return "Name should only contain letters and spaces";
  }
  if (/\s{2,}/.test(name)) {
    return "Name should not contain consecutive spaces";
  }
  // if (!nameRegex.test(name)) {
  //   return "Name contains invalid characters";
  // }
  return null;  // No errors
};
const isValidDescription = (description) => {
  if (!description) {
    return "Description is required";
  }
  if (/^\d/.test(description)) {
    return "Description should not start with a number";
  }
  if (/^[\s]/.test(description)) {
    return "Description should not start with a space";
  }
  if (/[^a-zA-Z0-9\s]/.test(description)) {
    return "Description should only contain letters, numbers, and spaces";
  }
  if (/\s{2,}/.test(description)) {
    return "Description should not contain consecutive spaces";
  }
  const words = description.trim().split(/\s+/);
  if (words.length > 200) {
    return "Description should be less than 200 words long";
  }
  return null;  // No errors
};

const isValidLocation = (location) => {
  if (!location) {
    return "Location is required";
  }
  if (/^[\s]/.test(location)) {
    return "Location should not start with a space";
  }
  if (/[^a-zA-Z\s]/.test(location)) {
    return "Location should only contain letters and spaces";
  }
  if (/\s{2,}/.test(location)) {
    return "Location should not contain consecutive spaces";
  }
  return null;  // No errors
};

// const isValidCountryCode = (countryCode) => {
//   // List of valid country codes (this is a sample, not exhaustive)
//   // const validCodes = ['+1', '+44', '+91', '+86', '+81', '+49', '+33', '+7', '+61', '+55'];

//   // Remove any whitespace
//   const cleanCode = countryCode.replace(/\s/g, '');

//   if (cleanCode.length === 0) {
//     return { isValid: false, message: "Country code cannot be empty." };
//   }

//   if (!cleanCode.startsWith('+')) {
//     return { isValid: false, message: "Country code must start with '+'." };
//   }

//   if (!/^\+\d{1,4}$/.test(cleanCode)) {
//     return { isValid: false, message: "Invalid format. Use '+' followed by 1-4 digits." };
//   }

//   // if (!validCodes.includes(cleanCode)) {
//   //   return { isValid: false, message: "Not a recognized country code." };
//   // }

//   return null
// };

// Function to validate time string
function isValidTimeString(timeString) {
  return moment(timeString, 'HH:mm:ss', true).isValid();
}

function parseTimeString(timeString) {
  return moment(timeString, 'HH:mm:ss');
}

// const isValidLength = name => name.length >= 4 && name.length<=40 && !/^\d/.test(name)

// const isDateGreterThanToday = date => moment(date).isSameOrAfter(today, "day");

// const isValidStartTime = startTime => moment(startTime).isSameOrAfter(today);

// const isValidEndTime = (startTime, endTime) => moment(endTime).isAfter(startTime);

function updateDailySlotAvailability(existingSlots, selectedSlots) {
  // Deep clone the existing slots to avoid mutating the original data
  const updatedSlots = JSON.parse(JSON.stringify(existingSlots));

  selectedSlots.forEach(selectedSlot => {
    const selectedStart = new Date(selectedSlot.startTime);
    const selectedEnd = new Date(selectedSlot.endTime);

    updatedSlots.forEach(slot => {
      const slotStart = new Date(slot.slot.start);
      const slotEnd = new Date(slot.slot.end);

      // Check if the selected slot overlaps with this slot
      if (selectedStart < slotEnd && selectedEnd > slotStart) {
        // Filter out mini slots that overlap with the selected slot
        slot.availableMiniSlots = slot.availableMiniSlots.filter(miniSlot => {
          const miniStart = new Date(miniSlot.start);
          const miniEnd = new Date(miniSlot.end);
          return miniEnd <= selectedStart || miniStart >= selectedEnd;
        });
      }
    });
  });

  return updatedSlots;
}
module.exports = {
  isValidEmail,
  isValidDescription,
  isValidLocation,
  // isValidPhone,
  // isValidCountryCode,
  isValidTimeString,
  parseTimeString,
  updateDailySlotAvailability,
//   isDateGreterThanToday,
//   isValidStartTime,
//   isValidEndTime,
  isValidPassword,
  isValidLength
};