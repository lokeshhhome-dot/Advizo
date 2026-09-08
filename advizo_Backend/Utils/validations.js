const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const validatePhone = (phone) => /^[0-9]{10,12}$/.test(phone);

module.exports = {
    validatePhone,
    validateEmail,
};