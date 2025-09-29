const { getFirestore, getStorage } = require('../../config/firebase');
const logger = require('../utils/logger');

class FirebaseService {
  constructor() {
    this.db = null;
    this.bucket = null;
  }

  initialize() {
    this.db = getFirestore();
    this.bucket = getStorage();
  }

  // Firestore operations
  async createDocument(collection, data, docId = null) {
    try {
      const db = this.db || getFirestore();
      let docRef;

      if (docId) {
        docRef = db.collection(collection).doc(docId);
      } else {
        docRef = db.collection(collection).doc();
      }

      const document = {
        ...data,
        id: docRef.id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await docRef.set(document);
      return { id: docRef.id, ...document };
    } catch (error) {
      logger.error('Error creating document:', error);
      throw error;
    }
  }

  async getDocument(collection, docId) {
    try {
      const db = this.db || getFirestore();
      const doc = await db.collection(collection).doc(docId).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      logger.error('Error getting document:', error);
      throw error;
    }
  }

  async updateDocument(collection, docId, data) {
    try {
      const db = this.db || getFirestore();
      const docRef = db.collection(collection).doc(docId);
      
      const updateData = {
        ...data,
        updatedAt: new Date()
      };

      await docRef.update(updateData);
      
      const updatedDoc = await docRef.get();
      return { id: updatedDoc.id, ...updatedDoc.data() };
    } catch (error) {
      logger.error('Error updating document:', error);
      throw error;
    }
  }

  async deleteDocument(collection, docId) {
    try {
      const db = this.db || getFirestore();
      await db.collection(collection).doc(docId).delete();
      return { id: docId, deleted: true };
    } catch (error) {
      logger.error('Error deleting document:', error);
      throw error;
    }
  }

  async getCollection(collection, filters = {}) {
    try {
      const db = this.db || getFirestore();
      let query = db.collection(collection);

      // Apply filters
      Object.keys(filters).forEach(key => {
        if (filters[key] !== undefined && filters[key] !== null) {
          query = query.where(key, '==', filters[key]);
        }
      });

      const snapshot = await query.get();
      const documents = [];
      
      snapshot.forEach(doc => {
        documents.push({ id: doc.id, ...doc.data() });
      });

      return documents;
    } catch (error) {
      logger.error('Error getting collection:', error);
      throw error;
    }
  }

  // Storage operations
  async uploadFile(buffer, fileName, contentType) {
    try {
      const bucket = this.bucket || getStorage();
      const file = bucket.file(fileName);

      await file.save(buffer, {
        metadata: {
          contentType
        }
      });

      await file.makePublic();
      
      const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;
      return publicUrl;
    } catch (error) {
      logger.error('Error uploading file:', error);
      throw error;
    }
  }

  async deleteFile(fileName) {
    try {
      const bucket = this.bucket || getStorage();
      const file = bucket.file(fileName);

      const [exists] = await file.exists();
      if (!exists) {
        throw new Error('File not found');
      }

      await file.delete();
      return { fileName, deleted: true };
    } catch (error) {
      logger.error('Error deleting file:', error);
      throw error;
    }
  }

  async getFileMetadata(fileName) {
    try {
      const bucket = this.bucket || getStorage();
      const file = bucket.file(fileName);

      const [metadata] = await file.getMetadata();
      return metadata;
    } catch (error) {
      logger.error('Error getting file metadata:', error);
      throw error;
    }
  }

  // Batch operations
  async batchWrite(operations) {
    try {
      const db = this.db || getFirestore();
      const batch = db.batch();

      operations.forEach(operation => {
        const { type, collection, docId, data } = operation;
        const docRef = db.collection(collection).doc(docId);

        switch (type) {
          case 'create':
          case 'set':
            batch.set(docRef, { ...data, updatedAt: new Date() });
            break;
          case 'update':
            batch.update(docRef, { ...data, updatedAt: new Date() });
            break;
          case 'delete':
            batch.delete(docRef);
            break;
          default:
            throw new Error(`Invalid batch operation type: ${type}`);
        }
      });

      await batch.commit();
      return { success: true, operationsCount: operations.length };
    } catch (error) {
      logger.error('Error in batch write:', error);
      throw error;
    }
  }
}

module.exports = new FirebaseService();