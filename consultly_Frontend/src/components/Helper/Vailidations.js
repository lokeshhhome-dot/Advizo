
export const validateForm = (formData) => {
    let newErrors = {};

    for (let field of validationOrder) {
        const value = formData[field.key];

        if (!value || value.trim() === "") {
            newErrors[field.key] = `${field.label} is required`;
            setErrors(newErrors);
            return false; // stop at first invalid field
        }
    }

    setErrors({});
    return true;
};