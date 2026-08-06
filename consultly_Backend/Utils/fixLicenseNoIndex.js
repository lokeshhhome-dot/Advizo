/**
 * Fix Sparse Indexes - Drop and recreate as sparse
 * 
 * Fixes duplicate key errors for licenseNo and agoraUid
 * 
 * Usage: node Utils/fixLicenseNoIndex.js
 */

const mongoose = require("mongoose");
const dotenv = require("dotenv");
dotenv.config();

async function fixSparseIndexes() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_DB_URL || process.env.MONGO_URI || process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error("❌ MongoDB URL not found in environment variables (MONGO_DB_URL, MONGO_URI, or MONGODB_URI)");
            process.exit(1);
        }

        await mongoose.connect(mongoUri);
        console.log("✅ Connected to MongoDB");

        const db = mongoose.connection.db;
        const collection = db.collection("ragisterusers");

        // Check existing indexes
        const indexes = await collection.indexes();
        console.log("\n📋 Current indexes:", indexes.map(idx => idx.name));

        // Fix licenseNo_1 index
        console.log("\n🔧 Fixing licenseNo_1 index...");
        try {
            await collection.dropIndex("licenseNo_1");
            console.log("  ✅ Dropped existing licenseNo_1 index");
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log("  ℹ️  licenseNo_1 index doesn't exist, skipping drop");
            } else {
                throw error;
            }
        }

        await collection.createIndex(
            { licenseNo: 1 },
            { 
                unique: true, 
                sparse: true,
                name: "licenseNo_1"
            }
        );
        console.log("  ✅ Created new sparse unique index on licenseNo");

        // Fix agoraUid_1 index
        console.log("\n🔧 Fixing agoraUid_1 index...");
        try {
            await collection.dropIndex("agoraUid_1");
            console.log("  ✅ Dropped existing agoraUid_1 index");
        } catch (error) {
            if (error.code === 27 || error.codeName === 'IndexNotFound') {
                console.log("  ℹ️  agoraUid_1 index doesn't exist, skipping drop");
            } else {
                throw error;
            }
        }

        await collection.createIndex(
            { agoraUid: 1 },
            { 
                unique: true, 
                sparse: true,
                name: "agoraUid_1"
            }
        );
        console.log("  ✅ Created new sparse unique index on agoraUid");

        // Verify the new indexes
        const newIndexes = await collection.indexes();
        const licenseNoIndex = newIndexes.find(idx => idx.name === "licenseNo_1");
        const agoraUidIndex = newIndexes.find(idx => idx.name === "agoraUid_1");
        
        console.log("\n✅ Verification:");
        console.log("  licenseNo_1:", JSON.stringify(licenseNoIndex, null, 2));
        console.log("  agoraUid_1:", JSON.stringify(agoraUidIndex, null, 2));

        console.log("\n🎉 All indexes fixed successfully!");
        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error("❌ Error fixing indexes:", error);
        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the fix
fixSparseIndexes();

