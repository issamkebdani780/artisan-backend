const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
require('dotenv').config();

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Storage configuration for profile pictures
const profilePicStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'bericoli/profile-pictures',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        resource_type: 'auto',
        quality: 'auto:good'
    }
});

// Storage configuration for artisan documents
const documentsStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'bericoli/artisan-documents',
        allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
        resource_type: 'auto'
    }
});

// Storage configuration for service images
const servicesStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'bericoli/services',
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        resource_type: 'auto',
        quality: 'auto:good'
    }
});

// Multer configuration for single profile picture
const uploadProfilePic = multer({
    storage: profilePicStorage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for profile pictures'));
        }
    }
});

// Multer configuration for multiple documents
const uploadDocuments = multer({
    storage: documentsStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB per file
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png'
        ];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only PDF, DOC, DOCX, JPG, and PNG files are allowed'));
        }
    }
});

// Multer configuration for single service image
const uploadServiceImage = multer({
    storage: servicesStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB
    },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for services'));
        }
    }
});

// Storage config for combined uploads
const combinedStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        if (file.fieldname === 'profilePic') {
            return {
                folder: 'bericoli/profile-pictures',
                allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
                resource_type: 'auto',
                quality: 'auto:good'
            };
        } else {
            return {
                folder: 'bericoli/artisan-documents',
                allowed_formats: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png'],
                resource_type: 'auto'
            };
        }
    }
});

const uploadCombined = multer({
    storage: combinedStorage,
    limits: { fileSize: 10 * 1024 * 1024 }
});

module.exports = {
    uploadProfilePic: uploadProfilePic.single('profilePic'),
    uploadDocuments: uploadDocuments.array('documents', 5),
    uploadCombined: uploadCombined.fields([
        { name: 'profilePic', maxCount: 1 },
        { name: 'documents', maxCount: 5 }
    ]),
    uploadServiceImage: uploadServiceImage.single('serviceImage'),
    cloudinary
};
