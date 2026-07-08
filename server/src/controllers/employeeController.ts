import { Request, Response } from 'express';
import Employee from '../models/Employee';

export const getCityEmployees = async (req: Request, res: Response) => {
  try {
    const { cityId } = req.params;
    const employees = await Employee.find({ cityId }).sort({ createdAt: -1 });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
};

export const getEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findById(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
};

export const createEmployee = async (req: Request, res: Response) => {
  try {
    const { cityId, fullName, birthDate } = req.body;
    if (!cityId || !fullName) {
      return res.status(400).json({ error: 'cityId and fullName are required' });
    }
    const employee = new Employee({ cityId, fullName, birthDate });
    await employee.save();
    res.status(201).json(employee);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create employee' });
  }
};

export const updateEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findByIdAndUpdate(id, req.body, { new: true });
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json(employee);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update employee' });
  }
};

export const deleteEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const employee = await Employee.findByIdAndDelete(id);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ message: 'Employee deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete employee' });
  }
};

export const uploadPhoto = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const photoUrl = `/uploads/${req.file.filename}`;
    const employee = await Employee.findByIdAndUpdate(
      id,
      { photoUrl },
      { new: true }
    );
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }
    res.json({ photoUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload photo' });
  }
};
