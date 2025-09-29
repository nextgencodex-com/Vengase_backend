const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');

class Product {
  constructor() {
    this.collection = 'products';
  }

  async create(productData) {
    try {
      const db = getFirestore();
      
      // Generate integer ID for compatibility with frontend
      const id = await this.generateIntegerId();
      const productRef = db.collection(this.collection).doc(id.toString());
      
      const product = {
        ...productData,
        id: id,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await productRef.set(product);
      logger.info(`Product created with ID: ${id}`);
      
      return product;
    } catch (error) {
      logger.error('Error creating product:', error);
      throw error;
    }
  }

  async generateIntegerId() {
    try {
      const db = getFirestore();
      // Start from ID 1000 to avoid conflicts with static products (IDs 1-22)
      const MIN_DYNAMIC_ID = 1000;
      
      const snapshot = await db.collection(this.collection)
        .where('id', '>=', MIN_DYNAMIC_ID)
        .orderBy('id', 'desc')
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return MIN_DYNAMIC_ID; // Start from 1000
      }
      
      const lastProduct = snapshot.docs[0].data();
      return (lastProduct.id || MIN_DYNAMIC_ID - 1) + 1;
    } catch (error) {
      logger.warn('Error generating ID, using timestamp:', error);
      return Date.now(); // Fallback to timestamp (will be > 1000)
    }
  }

  async findById(id) {
    try {
      const db = getFirestore();
      const doc = await db.collection(this.collection).doc(id.toString()).get();
      
      if (!doc.exists) {
        return null;
      }
      
      return doc.data();
    } catch (error) {
      logger.error('Error finding product by ID:', error);
      throw error;
    }
  }

  async findAll(filters = {}) {
    try {
      const db = getFirestore();
      let query = db.collection(this.collection);

      // Only use simple queries to avoid index requirements
      // If we have category filter, use it as the primary filter
      if (filters.category) {
        query = query.where('category', '==', filters.category);
        // Don't add orderBy when we have where clauses to avoid composite index requirement
      } else {
        // Only add orderBy when no filters to avoid index requirements
        query = query.orderBy('createdAt', 'desc');
      }

      if (filters.limit) {
        query = query.limit(parseInt(filters.limit));
      }

      const snapshot = await query.get();
      let products = [];
      
      snapshot.forEach(doc => {
        products.push(doc.data());
      });

      // Apply additional filters in memory to avoid index requirements
      if (filters.subcategory) {
        products = products.filter(product => 
          product.subcategory === filters.subcategory
        );
      }
      
      if (filters.status) {
        products = products.filter(product => 
          product.status === filters.status
        );
      }

      if (filters.minPrice) {
        const minPrice = parseFloat(filters.minPrice);
        products = products.filter(product => 
          product.price >= minPrice
        );
      }

      if (filters.maxPrice) {
        const maxPrice = parseFloat(filters.maxPrice);
        products = products.filter(product => 
          product.price <= maxPrice
        );
      }

      if (filters.q) {
        const searchTerm = filters.q.toLowerCase();
        products = products.filter(product => 
          product.name?.toLowerCase().includes(searchTerm) ||
          product.description?.toLowerCase().includes(searchTerm) ||
          product.subcategory?.toLowerCase().includes(searchTerm) ||
          product.fabric?.toLowerCase().includes(searchTerm) ||
          product.features?.some(feature => feature.toLowerCase().includes(searchTerm)) ||
          product.colors?.some(color => color.toLowerCase().includes(searchTerm))
        );
      }

      // Apply sorting if requested (in memory)
      if (filters.sortBy) {
        const sortOrder = filters.sortOrder === 'desc' ? 'desc' : 'asc';
        products.sort((a, b) => {
          const aVal = a[filters.sortBy];
          const bVal = b[filters.sortBy];
          
          if (typeof aVal === 'string') {
            return sortOrder === 'asc' 
              ? aVal.localeCompare(bVal)
              : bVal.localeCompare(aVal);
          } else {
            return sortOrder === 'asc' 
              ? aVal - bVal
              : bVal - aVal;
          }
        });
      } else {
        // Default sort by id
        products.sort((a, b) => a.id - b.id);
      }

      // Apply offset after sorting
      if (filters.offset) {
        const offset = parseInt(filters.offset);
        products = products.slice(offset);
      }

      return products;
    } catch (error) {
      logger.error('Error finding products:', error);
      throw error;
    }
  }

  async update(id, updateData) {
    try {
      const db = getFirestore();
      const productRef = db.collection(this.collection).doc(id.toString());
      
      const doc = await productRef.get();
      if (!doc.exists) {
        throw new Error('Product not found');
      }

      const updatedData = {
        ...updateData,
        updatedAt: new Date()
      };

      await productRef.update(updatedData);
      logger.info(`Product updated with ID: ${id}`);
      
      const updatedDoc = await productRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating product:', error);
      throw error;
    }
  }

  async delete(id) {
    try {
      const db = getFirestore();
      const productRef = db.collection(this.collection).doc(id.toString());
      
      const doc = await productRef.get();
      if (!doc.exists) {
        throw new Error('Product not found');
      }

      await productRef.delete();
      logger.info(`Product deleted with ID: ${id}`);
      
      return { id, message: 'Product deleted successfully' };
    } catch (error) {
      logger.error('Error deleting product:', error);
      throw error;
    }
  }

  async findAllSimple() {
    try {
      const db = getFirestore();
      // Simple query with no filters to avoid index issues
      const snapshot = await db.collection(this.collection)
        .orderBy('createdAt', 'desc')
        .get();
      
      const products = [];
      snapshot.forEach(doc => {
        products.push(doc.data());
      });
      
      return products;
    } catch (error) {
      logger.error('Error finding all products:', error);
      throw error;
    }
  }

  async search(searchTerm) {
    try {
      return await this.findAll({ q: searchTerm });
    } catch (error) {
      logger.error('Error searching products:', error);
      throw error;
    }
  }

  async updateStock(id, stockData) {
    try {
      const db = getFirestore();
      const productRef = db.collection(this.collection).doc(id.toString());
      
      const doc = await productRef.get();
      if (!doc.exists) {
        throw new Error('Product not found');
      }

      const currentData = doc.data();
      const updatedStock = { ...currentData.stock, ...stockData };
      
      await productRef.update({
        stock: updatedStock,
        updatedAt: new Date()
      });

      logger.info(`Stock updated for product ID: ${id}`);
      
      const updatedDoc = await productRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating stock:', error);
      throw error;
    }
  }
}

module.exports = new Product();