import { Router } from 'express';
import { getCities, createCity, updateCity, deleteCity } from '../controllers/cityController';

const router = Router();

router.get('/', getCities);
router.post('/', createCity);
router.patch('/:id', updateCity);
router.delete('/:id', deleteCity);

export default router;
