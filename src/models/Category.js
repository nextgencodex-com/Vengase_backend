const { getFirestore } = require('../../config/firebase');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class Category {
  constructor() {
    this.collection = 'categories';
  }

  // Initialize default categories
  async initializeDefaultCategories() {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection).get();
      
      if (!snapshot.empty) {
        logger.info('Categories already initialized');
        return;
      }

      const defaultCategories = [
        {
          name: 'unisex',
          label: 'Unisex',
          subcategories: [
            { value: 't-shirts-shirts', label: 'T-shirts & Shirts' },
            { value: 'pants-shorts', label: 'Pants & Shorts' },
            { value: 'slides-socks', label: 'Slides & Socks' },
            { value: 'jackets-hoodies', label: 'Jackets & Hoodies' }
          ]
        },
        {
          name: 'accessories',
          label: 'Accessories',
          subcategories: [
            { value: 'bags', label: 'Bags & Backpacks' },
            { value: 'caps', label: 'Caps & Hats' },
            { value: 'bottles', label: 'Bottles' }
          ]
        },
        {
          name: 'jewelry',
          label: 'Jewelry',
          subcategories: [
            { value: 'bracelets', label: 'Bracelets' },
            { value: 'necklaces', label: 'Necklaces' },
            { value: 'rings', label: 'Rings' }
          ]
        }
      ];

      for (const category of defaultCategories) {
        await this.create(category);
      }

      logger.info('Default categories initialized successfully');
    } catch (error) {
      logger.error('Error initializing default categories:', error);
      throw error;
    }
  }

  // Create a new category
  async create(categoryData) {
    try {
      const db = getFirestore();
      const id = uuidv4();
      const categoryRef = db.collection(this.collection).doc(id);

      // Add IDs to subcategories
      const subcategoriesWithIds = (categoryData.subcategories || []).map(sub => ({
        ...sub,
        id: sub.id || uuidv4()
      }));

      const category = {
        id,
        name: categoryData.name,
        label: categoryData.label,
        subcategories: subcategoriesWithIds,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await categoryRef.set(category);
      logger.info(`Category created with ID: ${id}`);

      return category;
    } catch (error) {
      logger.error('Error creating category:', error);
      throw error;
    }
  }

  // Get all categories
  async findAll() {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection)
        .orderBy('createdAt', 'asc')
        .get();

      const categories = [];
      snapshot.forEach(doc => {
        categories.push(doc.data());
      });

      return categories;
    } catch (error) {
      logger.error('Error finding all categories:', error);
      throw error;
    }
  }

  // Get category by ID
  async findById(id) {
    try {
      const db = getFirestore();
      const doc = await db.collection(this.collection).doc(id).get();

      if (!doc.exists) {
        return null;
      }

      return doc.data();
    } catch (error) {
      logger.error('Error finding category by ID:', error);
      throw error;
    }
  }

  // Get category by name
  async findByName(name) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection(this.collection)
        .where('name', '==', name)
        .limit(1)
        .get();

      if (snapshot.empty) {
        return null;
      }

      return snapshot.docs[0].data();
    } catch (error) {
      logger.error('Error finding category by name:', error);
      throw error;
    }
  }

  // Update category
  async update(id, updateData) {
    try {
      const db = getFirestore();
      const categoryRef = db.collection(this.collection).doc(id);

      const doc = await categoryRef.get();
      if (!doc.exists) {
        throw new Error('Category not found');
      }

      const updatedData = {
        ...updateData,
        updatedAt: new Date()
      };

      await categoryRef.update(updatedData);
      logger.info(`Category updated with ID: ${id}`);

      const updatedDoc = await categoryRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating category:', error);
      throw error;
    }
  }

  // Delete category
  async delete(id) {
    try {
      const db = getFirestore();
      const categoryRef = db.collection(this.collection).doc(id);

      const doc = await categoryRef.get();
      if (!doc.exists) {
        throw new Error('Category not found');
      }

      await categoryRef.delete();
      logger.info(`Category deleted with ID: ${id}`);

      return { id, message: 'Category deleted successfully' };
    } catch (error) {
      logger.error('Error deleting category:', error);
      throw error;
    }
  }

  // Add subcategory to a category
  async addSubcategory(categoryId, subcategoryData) {
    try {
      const db = getFirestore();
      const categoryRef = db.collection(this.collection).doc(categoryId);

      const doc = await categoryRef.get();
      if (!doc.exists) {
        throw new Error('Category not found');
      }

      const category = doc.data();
      const newSubcategory = {
        ...subcategoryData,
        id: uuidv4()
      };

      const updatedSubcategories = [...(category.subcategories || []), newSubcategory];

      await categoryRef.update({
        subcategories: updatedSubcategories,
        updatedAt: new Date()
      });

      logger.info(`Subcategory added to category ${categoryId}`);

      const updatedDoc = await categoryRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error adding subcategory:', error);
      throw error;
    }
  }

  // Update subcategory
  async updateSubcategory(categoryId, subcategoryId, updateData) {
    try {
      const db = getFirestore();
      const categoryRef = db.collection(this.collection).doc(categoryId);

      const doc = await categoryRef.get();
      if (!doc.exists) {
        throw new Error('Category not found');
      }

      const category = doc.data();
      const subcategories = category.subcategories || [];
      
      const subcategoryIndex = subcategories.findIndex(sub => sub.id === subcategoryId);
      if (subcategoryIndex === -1) {
        throw new Error('Subcategory not found');
      }

      subcategories[subcategoryIndex] = {
        ...subcategories[subcategoryIndex],
        ...updateData
      };

      await categoryRef.update({
        subcategories,
        updatedAt: new Date()
      });

      logger.info(`Subcategory ${subcategoryId} updated in category ${categoryId}`);

      const updatedDoc = await categoryRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error updating subcategory:', error);
      throw error;
    }
  }

  // Delete subcategory
  async deleteSubcategory(categoryId, subcategoryId) {
    try {
      const db = getFirestore();
      const categoryRef = db.collection(this.collection).doc(categoryId);

      const doc = await categoryRef.get();
      if (!doc.exists) {
        throw new Error('Category not found');
      }

      const category = doc.data();
      const updatedSubcategories = (category.subcategories || []).filter(
        sub => sub.id !== subcategoryId
      );

      await categoryRef.update({
        subcategories: updatedSubcategories,
        updatedAt: new Date()
      });

      logger.info(`Subcategory ${subcategoryId} deleted from category ${categoryId}`);

      const updatedDoc = await categoryRef.get();
      return updatedDoc.data();
    } catch (error) {
      logger.error('Error deleting subcategory:', error);
      throw error;
    }
  }

  // Check if category is in use by products
  async isInUse(categoryName) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection('products')
        .where('category', '==', categoryName)
        .limit(1)
        .get();

      return !snapshot.empty;
    } catch (error) {
      logger.error('Error checking if category is in use:', error);
      throw error;
    }
  }

  // Check if subcategory is in use by products
  async isSubcategoryInUse(subcategoryValue) {
    try {
      const db = getFirestore();
      const snapshot = await db.collection('products')
        .where('subcategory', '==', subcategoryValue)
        .limit(1)
        .get();

      return !snapshot.empty;
    } catch (error) {
      logger.error('Error checking if subcategory is in use:', error);
      throw error;
    }
  }
}

module.exports = new Category();
