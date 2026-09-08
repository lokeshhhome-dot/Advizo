
const { Conversation } = require("../Modal/Histroy");
const { User } = require("../Modal/userSchema");

const HistroyMW = async (toUid, fromUid, type) => {
   try {
      if (!fromUid || !toUid || !type) {
         console.error("Missing required fields in HistroyMW");
         return;
      }
      
      const user = await User.findById(toUid);
      const consultant = await User.findById(fromUid);
      console.log("user", user);
      console.log("consultant", consultant);

      if (user && consultant) {
         // Type validation - "voice" ko "audio" me convert karo
         const conversationType = type === "voice" ? "audio" : type;
         
         // Conversation create karo
         const conversation = new Conversation({
            consultantId: fromUid,
            userId: toUid,
            consultantSnapshot: {
               fullname: consultant.fullname,
               email: consultant.email,
               contactNumber: consultant.phone
            },
            userSnapshot: {
               fullname: user.fullname,
               email: user.email,
               contactNumber: user.contactNumber || null
            },
            type: conversationType, // "audio", "video", ya "chat"
            startTime: new Date()
         });
         
         await conversation.save();
         console.log(` Conversation created: Consultant ${consultant.fullname} talking to User ${user.fullname}`);
      }

   } catch (error) {
      console.error("Error in HistroyMW:", error);
   }
}

module.exports = { HistroyMW };