const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');

class Admin {
  constructor() {
    this.collection = 'admins';
  }

  async create(adminData) {
    try {
      const db = getFirestore();
      
      const admin = {
        ...adminData,
        createdAt: new Date(),
        updatedAt: new Date(),
        role: 'admin',
        status: 'active',
        lastLogin: null,
        loginCount: 0
      };

      const adminRef = db.collection(this.collection).doc(adminData.uid);
      await adminRef.set(admin);
      
      logger.info(`Admin profile created in database: ${adminData.email} (${adminData.uid})`);
      return admin;
    } catch (error) {
      logger.error('Error creating admin in database:', error);
      throw error;
    }
  }

  async findByUid(uid) {
    try {
      const db = getFirestore();
      const doc = await db.collection(this.collection).doc(uid).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      logger.error('Error finding admin by UID:', error);
      throw error;
    }
  }

  async findByEmail(email) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection)
        .where('email', '==', email)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return null;
      }
      
      const doc = snapshot.docs[0];
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      logger.error('Error finding admin by email:', error);
      throw error;
    }
  }

  async findAll() {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection)
        .orderBy('createdAt', 'desc')
        .get();
      
      const admins = [];
      snapshot.forEach(doc => {
        admins.push({ id: doc.id, ...doc.data() });
      });
      
      return admins;
    } catch (error) {
      logger.error('Error finding all admins:', error);
      throw error;
    }
  }

  async update(uid, updateData) {
    try {
      const db = getFirestore();
      const adminRef = db.collection(this.collection).doc(uid);
      
      const doc = await adminRef.get();
      if (!doc.exists) {
        throw new Error('Admin not found in database');
      }

      const updatedData = {
        ...updateData,
        updatedAt: new Date()
      };

      await adminRef.update(updatedData);
      logger.info(`Admin updated in database: ${uid}`);
      
      const updatedDoc = await adminRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      logger.error('Error updating admin:', error);
      throw error;
    }
  }

  async updateLastLogin(uid) {
    try {
      const db = getFirestore();
      const adminRef = db.collection(this.collection).doc(uid);
      
      const doc = await adminRef.get();
      if (doc.exists) {
        const currentData = doc.data();
        await adminRef.update({
          lastLogin: new Date(),
          loginCount: (currentData.loginCount || 0) + 1,
          updatedAt: new Date()
        });
        logger.info(`Admin login recorded: ${uid}`);
      }
    } catch (error) {
      logger.error('Error updating admin last login:', error);
      // Don't throw error here as it's not critical
    }
  }

  async delete(uid) {
    try {
      const db = getFirestore();
      const adminRef = db.collection(this.collection).doc(uid);
      
      const doc = await adminRef.get();
      if (!doc.exists) {
        throw new Error('Admin not found in database');
      }

      await adminRef.delete();
      logger.info(`Admin deleted from database: ${uid}`);
      
      return { uid, message: 'Admin deleted from database successfully' };
    } catch (error) {
      logger.error('Error deleting admin from database:', error);
      throw error;
    }
  }

  async getAdminStats() {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection).get();
      
      let totalAdmins = 0;
      let activeAdmins = 0;
      let recentLogins = 0;
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      snapshot.forEach(doc => {
        const data = doc.data();
        totalAdmins++;
        
        if (data.status === 'active') {
          activeAdmins++;
        }
        
        if (data.lastLogin && data.lastLogin.toDate() > thirtyDaysAgo) {
          recentLogins++;
        }
      });

      return {
        totalAdmins,
        activeAdmins,
        recentLogins,
        inactiveAdmins: totalAdmins - activeAdmins
      };
    } catch (error) {
      logger.error('Error getting admin stats:', error);
      throw error;
    }
  }
}

module.exports = new Admin();